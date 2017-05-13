const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const fetchImpl = require('node-fetch')
const Response = require('node-fetch/lib/response')
const VCR_MODE = process.env['VCR_MODE'] || 'playback'
const DEBUG = process.env['DEBUG'] || false

// Valid modes:
// - 'playback': ONLY uses the fixture files (default)
// - 'cache': tries to use the fixture and if not found then fetched and saves
// - 'record': forces files to be written
// - 'erase': deletes the fixture corresponding to the request


// mode: 'playback' or 'cache' or 'record'
// fixturePath: __dirname + '/_fixtures/'
const CONFIGURATION = {
  mode: VCR_MODE,
  fixturePath: path.join(process.cwd(), '_fixtures'),
  headerBlacklist: ['authorization'] // These need to be lowercase
}

function debug(url, message) {
  if (DEBUG) {
    console.log(url, message)
  }
}

buildHash = function(url, args) {
  const hash = crypto.createHash('sha256')
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
  hash.update(JSON.stringify(json))
  return hash.digest('hex')
}

buildFilenamePrefix = function(url, args, hash) {
  args = args || {method: 'GET'}
  url = url.replace(/\//g, '_')
  const method = args.method.toUpperCase()
  return url + '_' + method + '_' + hash
}

buildOptionsFilename = function(url, args, hash) {
  return buildFilenamePrefix(url, args, hash) + '_options.json'
}

buildContentsFilename = function(url, args, hash) {
  return buildFilenamePrefix(url, args, hash) + '_body.raw'
}

function loadFixture(url, args) {
  const hash = buildHash(url, args)
  const contentsFilename = path.join(CONFIGURATION.fixturePath, buildContentsFilename(url, args, hash))
  const optionsFilename = path.join(CONFIGURATION.fixturePath, buildOptionsFilename(url, args, hash))
  return new Promise(function(resolve, reject) {
    // Read the Response options
    fs.readFile(optionsFilename, function(err, optionsRaw) {
      if (err) {
        return reject(err)
      }
      const opts = JSON.parse(optionsRaw.toString())

      // Read the Response contens
      fs.readFile(contentsFilename, function(err, contentsBuffer) {
        if (err) {
          return reject(err)
        }
        resolve(new Response(contentsBuffer, opts))
      })
    })
  })
}

function saveFixture(url, args, response) {
  const hash = buildHash(url, args)
  const contentsFilename = path.join(CONFIGURATION.fixturePath, buildContentsFilename(url, args, hash))
  const optionsFilename = path.join(CONFIGURATION.fixturePath, buildOptionsFilename(url, args, hash))

  // Convert the response body to a Buffer for saving
  debug(url, 'getting buffer to save');
  // DO NOT .clone() this response because response.clone() does not work well. See https://github.com/bitinn/node-fetch/issues/151
  return response.buffer()
  .then(function(contentsBuffer) {
    // Write the Response contents
    const contentsPromise = new Promise(function(resolve, reject) {
      debug(url, 'writing body to file');
      fs.writeFile(contentsFilename, contentsBuffer, function(err) {
        if (err) {
          debug(url, 'problem writing body to file', err);
          return reject(new Error('fetch-vcr ERROR while attempting to save fixture file to ' + contentsFilename + '. Maybe the directory does not exist?'))
        }
        resolve(true)
      })
    })

    // Write the Response options
    const json = {
      url: response.url,
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      headers: response.headers.raw()
    }
    const optionsRaw = JSON.stringify(json)
    const optionsPromise = new Promise(function(resolve, reject) {
      fs.writeFile(optionsFilename, optionsRaw, function(err) {
        if (err) {
          debug(url, 'problem writing options to file', err);
          return reject(new Error('fetch-vcr ERROR while attempting to save fixture file to ' + optionsFilename + '. Maybe the directory does not exist?'))
        }
        resolve(true)
      })
    })

    return Promise.all([contentsPromise, optionsPromise])
    .then(function() {
      // send a new buffer because response.clone() does not work well. See https://github.com/bitinn/node-fetch/issues/151
      return new Response(contentsBuffer, json)
    })
  })
}

function fetchVCR(url, args) {
  const hash = buildHash(url, args)
  const contentsFilename = path.join(CONFIGURATION.fixturePath, buildContentsFilename(url, args, hash))
  const optionsFilename = path.join(CONFIGURATION.fixturePath, buildOptionsFilename(url, args, hash))

  // Try to load the response from the fixture.
  // Then, if a fixture was not found, either fetch it for reals or error (depending on the VCR_MODE)
  return new Promise(function(resolve, reject) {
    if (CONFIGURATION.mode === 'record') {
      // Perform the fetch, save the response, and then yield the original response
      fetchImpl(url, args)
      .catch(reject)
      .then(function(response) {
        saveFixture(url, args, response)
        .then(resolve)
        .catch(reject)
      })

    } else {
      debug(url, 'checking for cached version');
      // Check if cached version exists
      fs.access(optionsFilename, fs.constants.R_OK, function(err) {
        if (err) {
          // Cached version does not exist
          debug(url, 'cached version not found');
          if (CONFIGURATION.mode === 'cache') {
            debug(url, 'making network request');
            // Perform the fetch, save the response, and then yield the original response
            fetchImpl(url, args)
            .catch(reject)
            .then(function(response) {
              debug(url, 'saving network request');
              saveFixture(url, args, response)
              .then(function(val) {
                debug(url, 'done saving');
                resolve(val)
              })
              .catch(reject)
            })
          } else {
            debug(url, 'NOT making network request because VCR_MODE=' + CONFIGURATION.mode);
            // throw new Error('fetch-vcr ERROR: Fixture file was not found.')
            reject(err) // TODO: Provide a more detailed message
          }
        } else {
          debug(url, 'using cached version');
          loadFixture(url, args)
          .then(resolve, reject)
        }
      })
    }
  })
}

fetchVCR.configure = function(config) {
  CONFIGURATION.mode = config.mode || VCR_MODE
  CONFIGURATION.fixturePath = config.fixturePath || CONFIGURATION.fixturePath
  if (config.headerBlacklist) {
    CONFIGURATION.headerBlacklist = []
    config.headerBlacklist.forEach(function(key) {
      CONFIGURATION.headerBlacklist.push(key.toLowerCase())
    })
  }
}

module.exports = fetchVCR


// const TEST_URL = 'https://openstax.org'
// fetchVCR.configure({mode: 'cache'})
// return fetchVCR(TEST_URL)
// .then(resp => {
//   return resp.text()
//   .then(text => {
//     console.log(text);
//     return text
//   })
// })
