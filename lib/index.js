// const crypto = require('crypto')
const fetchImpl = require('./adapter/fetch-node')
const Response = require('./adapter/response-node')
const {loadFile, saveFile} = require('./adapter/files-node')
const VCR_MODE = typeof process !== 'undefined' ? process.env['VCR_MODE'] : null
const DEBUG = typeof process !== 'undefined' ? process.env['DEBUG'] : false

// Valid modes:
// - 'playback': ONLY uses the fixture files (default)
// - 'cache': tries to use the fixture and if not found then fetched and saves
// - 'record': forces files to be written
// - 'erase': deletes the fixture corresponding to the request


// mode: 'playback' or 'cache' or 'record'
// fixturePath: './_fixtures/'
const CONFIGURATION = {
  mode: VCR_MODE,
  fixturePath: './_fixtures',
  headerBlacklist: ['authorization', 'user-agent'] // These need to be lowercase
}

function debug(url, message) {
  if (DEBUG) {
    console.log(url, message)
  }
}


function hashCode(str) {
  var hash = 0, i, chr;
  if (str.length === 0) return hash;
  for (i = 0; i < str.length; i++) {
    chr   = str.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

function buildHash(url, args) {
  const json = {}
  if (args) {
    json.method = args.method
    json.redirect = args.redirect

    // Filter out all the headers in the headerBlacklist
    if (args.headers) {
      json.headers = {}
      const headerKeys = Object.keys(args.headers)
      for(const index in headerKeys) {
        const key = headerKeys[index]
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
  args = args || {method: 'GET'}
  url = escape(url).replace(/\//g, '_')
  const method = args.method.toUpperCase()
  return url + '_' + method + '_' + hash
}

function buildOptionsFilename(url, args, hash) {
  return buildFilenamePrefix(url, args, hash) + '_options.json'
}

function buildBodyFilename(url, args, hash) {
  return buildFilenamePrefix(url, args, hash) + '_body.raw'
}

function loadFixture(url, args) {
  const hash = buildHash(url, args)
  const bodyFilename = buildBodyFilename(url, args, hash)
  const optionsFilename = buildOptionsFilename(url, args, hash)
  const root = CONFIGURATION.fixturePath

  return Promise.all([loadFile(root, optionsFilename), loadFile(root, bodyFilename)])
  .then(function([optionsBuffer, bodyBuffer]) {
    const opts = JSON.parse(optionsBuffer.toString())
    // Use the correct constructor if there is a body
    if (bodyBuffer) {
      return new Response(bodyBuffer, opts)
    } else {
      return new Response(opts)
    }
  })
}

function saveFixture(url, args, response) {
  const hash = buildHash(url, args)
  const bodyFilename = buildBodyFilename(url, args, hash)
  const optionsFilename = buildOptionsFilename(url, args, hash)
  // const requestFilename = buildOptionsFilename(url, args, hash) + '_request.log'
  const root = CONFIGURATION.fixturePath

  // Convert the response body to a Buffer for saving
  debug(url, 'getting buffer to save');
  // DO NOT .clone() this response because response.clone() does not work well. See https://github.com/bitinn/node-fetch/issues/151
  return response.text()
  .then(function(bodyBuffer) {
    // Write the Response contents and the Response options
    const json = {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: response.headers.raw()
    }
    const optionsRaw = JSON.stringify(json)

    return Promise.all([saveFile(root, bodyFilename, bodyBuffer), saveFile(root, optionsFilename, optionsRaw) /*, saveFile(root, requestFilename, JSON.stringify(args || {})) */])
    .then(function() {
      // send a new buffer because response.clone() does not work well. See https://github.com/bitinn/node-fetch/issues/151
      // Use the correct constructor if there is a body
      if (bodyBuffer) {
        return new Response(bodyBuffer, json)
      } else {
        return new Response(json)
      }
    })
  })
}

function fetchVCR(url, args) {
  // Try to load the response from the fixture.
  // Then, if a fixture was not found, either fetch it for reals or error (depending on the VCR_MODE)
  return new Promise(function(resolve, reject) {
    if (CONFIGURATION.mode === 'record') {
      // Perform the fetch, save the response, and then yield the original response
      fetchImpl(url, args)
      .then(function(response) {
        saveFixture(url, args, response)
        .then(resolve)
        .catch(reject)
      })
      .catch(reject)

    } else {
      debug(url, 'checking for cached version');
      // Check if cached version exists
      loadFixture(url, args)
      .then(resolve)
      .catch(function(err) {
        // Cached version does not exist
        debug(url, 'cached version not found');
        if (CONFIGURATION.mode === 'cache') {
          debug(url, 'making network request');
          // Perform the fetch, save the response, and then yield the original response
          fetchImpl(url, args)
          .then(function(response) {
            debug(url, 'saving network request');
            saveFixture(url, args, response)
            .then(function(val) {
              debug(url, 'done saving');
              resolve(val)
            })
            .catch(reject)
          })
          .catch(reject)
        } else {
          debug(url, 'NOT making network request because VCR_MODE=' + CONFIGURATION.mode);
          // throw new Error('fetch-vcr ERROR: Fixture file was not found.')
          reject(err) // TODO: Provide a more detailed message
        }
      })
    }
  })
}

fetchVCR.configure = function(config) {
  CONFIGURATION.mode = VCR_MODE || config.mode
  CONFIGURATION.fixturePath = config.fixturePath || CONFIGURATION.fixturePath
  if (config.headerBlacklist) {
    CONFIGURATION.headerBlacklist = []
    config.headerBlacklist.forEach(function(key) {
      CONFIGURATION.headerBlacklist.push(key.toLowerCase())
    })
  }
}

module.exports = fetchVCR
