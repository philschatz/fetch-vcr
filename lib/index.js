var fetchImpl = require('./adapter/fetch-node')
var Response = require('./adapter/response-node')

var _require = require('./adapter/files-node')
var loadFile = _require.loadFile
var saveFile = _require.saveFile

var VCR_MODE = typeof process !== 'undefined' ? process.env['VCR_MODE'] : null
var DEBUG = typeof process !== 'undefined' ? process.env['DEBUG'] : false

// Valid modes:
// - 'playback': ONLY uses the fixture files (default)
// - 'cache': tries to use the fixture and if not found then fetched and saves
// - 'record': forces files to be written
// - 'erase': deletes the fixture corresponding to the request


// mode: 'playback' or 'cache' or 'record'
// fixturePath: './_fixtures/'
var CONFIGURATION = {
  mode: VCR_MODE,
  fixturePath: './_fixtures',
  headerBlacklist: ['authorization', 'user-agent'] // These need to be lowercase
}

function debug(url, message) {
  if (DEBUG) {
    console.log(url, message)
  }
}

// Use the correct constructor if there is a body.
// In a browser it needs to be the single-arg constructor.
function newResponse(bodyBuffer, opts) {
  if (bodyBuffer || typeof window === 'undefined') {
    return new Response(bodyBuffer, opts)
  } else {
    return new Response(null, opts)
  }
}

function hashCode(str) {
  var hash = 0,
      i,
      chr
  if (str.length === 0) return hash
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0 // Convert to 32bit integer
  }
  return hash
}

function parseHeader(headers) {
  if (headers.raw) return headers.raw();
  var raw = {};
  var itr = headers.entries()
  var next = itr.next();
  while (!next.done) {
    raw[next.value[0]] = next.value[1];
    next = itr.next();
  }
  return raw;
}

function buildHash(url, args) {
  var json = {}
  if (args) {
    json.method = args.method
    json.redirect = args.redirect
    json.body = args.body // Include POST body in the hash

    // Filter out all the headers in the headerBlacklist
    if (args.headers) {
      json.headers = {}
      var headerKeys = Object.keys(args.headers)
      for (var index in headerKeys) {
        var key = headerKeys[index]
        if (CONFIGURATION.headerBlacklist.indexOf(key.toLowerCase()) < 0) {
          json.headers[key] = args.headers[key]
        }
      }
    }
  }
  // const hash = crypto.createHash('sha256')
  // hash.update(JSON.stringify(json))
  // return hash.digest('hex')
  return hashCode(JSON.stringify(json))
}

function buildFilenamePrefix(url, args, hash) {
  args = args || { }
  url = escape(url).replace(/\//g, '_')
  var method = args.method || 'GET'
  method = method.toUpperCase()
  return url + '_' + method + '_' + hash
}

function buildOptionsFilename(url, args, hash) {
  return buildFilenamePrefix(url, args, hash) + '_options.json'
}

function buildBodyFilename(url, args, hash) {
  return buildFilenamePrefix(url, args, hash) + '_body.raw'
}

function loadFixture(url, args) {
  var hash = buildHash(url, args)
  var bodyFilename = buildBodyFilename(url, args, hash)
  var optionsFilename = buildOptionsFilename(url, args, hash)
  var root = CONFIGURATION.fixturePath

  return Promise.all([fetchVCR.loadFile(root, optionsFilename), fetchVCR.loadFile(root, bodyFilename)]).then(function (resolvedValues) {
    var optionsBuffer = resolvedValues[0]
    var bodyBuffer = resolvedValues[1]

    var opts = JSON.parse(optionsBuffer.toString())
    if (opts.headers && opts.headers['content-type'] && opts.headers['content-type'][0] && /^application\/json/.test(opts.headers['content-type'][0])) {
      // Check that the JSON is parseable
      // There is an odd thing that happens for api.github.com/search/repositories?q=github
      // Extra text is at the end of the JSON when it is saved to the fixture.
      // TODO: remove this hack by fixing it in fetch-vcr
      try {
        bodyBuffer = bodyBuffer.toString()
        JSON.parse(bodyBuffer)
      } catch (e) {
        // JSON occasionally has extra stuff at the end. not sure why
        // Sample message: "Unexpected number in JSON at position 146432"
        var tokens = e.message.split(' ')
        var num = parseInt(tokens[tokens.length - 1])
        console.log('---------------------------------')
        console.log('BUG: could not parse json. Using HACK')
        console.log(url + ' ' + (args && args.method || 'GET'))
        console.log('Message: "' + e.message + '"')
        console.log('Parse character:', num)
        console.log('---------------------------------')
        bodyBuffer = bodyBuffer.substring(0, num)
      }
    }

    // Use the correct constructor if there is a body
    return newResponse(bodyBuffer, opts)
  })
}

function saveFixture(url, args, response) {
  var hash = buildHash(url, args)
  var bodyFilename = buildBodyFilename(url, args, hash)
  var optionsFilename = buildOptionsFilename(url, args, hash)
  // const requestFilename = buildOptionsFilename(url, args, hash) + '_request.log'
  var root = CONFIGURATION.fixturePath

  // Convert the response body to a Buffer for saving
  debug(url, 'getting buffer to save')
  // DO NOT .clone() this response because response.clone() does not work well. See https://github.com/bitinn/node-fetch/issues/151
  return response.text().then(function (bodyBuffer) {
    // Write the Response contents and the Response options
    var json = {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: parseHeader(response.headers),
    }

    var optionsRaw = JSON.stringify(json)

    return Promise.all([fetchVCR.saveFile(root, bodyFilename, bodyBuffer), fetchVCR.saveFile(root, optionsFilename, optionsRaw) /*, fetchVCR.saveFile(root, requestFilename, JSON.stringify(args || {})) */]).then(function () {
      // send a new buffer because response.clone() does not work well. See https://github.com/bitinn/node-fetch/issues/151
      // Use the correct constructor if there is a body
      return newResponse(bodyBuffer, json)
    })
  })
}

function fetchVCR(url, args) {
  // Try to load the response from the fixture.
  // Then, if a fixture was not found, either fetch it for reals or error (depending on the VCR_MODE)
  return new Promise(function (resolve, reject) {
    if (CONFIGURATION.mode === 'record') {
      // Perform the fetch, save the response, and then yield the original response
      fetchImpl(url, args).then(function (response) {
        saveFixture(url, args, response).then(resolve).catch(reject)
      }).catch(reject)
    } else {
      debug(url, 'checking for cached version')
      // Check if cached version exists
      loadFixture(url, args).then(resolve).catch(function (err) {
        // Cached version does not exist
        debug(url, 'cached version not found because', err.message)
        if (CONFIGURATION.mode === 'cache') {
          debug(url, 'making network request')
          // Perform the fetch, save the response, and then yield the original response
          fetchImpl(url, args).then(function (response) {
            debug(url, 'saving network request')
            saveFixture(url, args, response).then(function (val) {
              debug(url, 'done saving')
              resolve(val)
            }).catch(reject)
          }).catch(reject)
        } else {
          debug(url, 'NOT making network request because VCR_MODE=' + CONFIGURATION.mode)
          // throw new Error('fetch-vcr ERROR: Fixture file was not found.')
          reject(err) // TODO: Provide a more detailed message
        }
      })
    }
  })
}

fetchVCR.configure = function (config) {
  CONFIGURATION.mode = VCR_MODE || config.mode
  CONFIGURATION.fixturePath = config.fixturePath || CONFIGURATION.fixturePath
  if (config.headerBlacklist) {
    CONFIGURATION.headerBlacklist = []
    config.headerBlacklist.forEach(function (key) {
      CONFIGURATION.headerBlacklist.push(key.toLowerCase())
    })
  }
}

fetchVCR.loadFile = loadFile
fetchVCR.saveFile = saveFile

module.exports = fetchVCR
