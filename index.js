const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const fetchImpl = require('node-fetch')
const Response = require('node-fetch/lib/response')
const VCR_MODE = process.env['VCR_MODE'] || 'playback'

// Valid modes:
// - 'playback': ONLY uses the fixture files (default)
// - 'cache': tries to use the fixture and if not found then fetched and saves
// - 'record': forces files to be written
// - 'erase': deletes the fixture corresponding to the request


// mode: 'playback' or 'cache' or 'record'
// fixturePath: __dirname + '/_fixtures/'
const CONFIGURATION = {mode: VCR_MODE, fixturePath: path.join(process.cwd(), '_fixtures')}

buildHash = function(url, args) {
  const hash = crypto.createHash('sha256')
  hash.update(JSON.stringify(args))
  return hash.digest('hex')
}

buildFilenamePrefix = function(url, args) {
  args = args || {method: 'GET'}
  url = url.replace(/\//g, '_')
  const method = args.method.toUpperCase()
  return url + '_' + method + '_' + buildHash(url, args)
}

buildOptionsFilename = function(url, args) {
  return buildFilenamePrefix(url, args) + '_options.json'
}

buildContentsFilename = function(url, args) {
  return buildFilenamePrefix(url, args) + '_body.raw'
}

function loadFixture(url, args) {
  return new Promise(function(resolve, reject) {
    // Read the Response options
    fs.readFile(path.join(CONFIGURATION.fixturePath, buildOptionsFilename(url, args)), function(err, optionsRaw) {
      if (err) {
        return reject(err)
      }
      const opts = JSON.parse(optionsRaw)

      // Read the Response contens
      fs.readFile(path.join(CONFIGURATION.fixturePath, buildContentsFilename(url, args)), function(err, contentsBuffer) {
        if (err) {
          return reject(err)
        }
        resolve(new Response(contentsBuffer, opts))
      })
    })
  })
}

function saveFixture(url, args, response) {
  const contentsFilename = path.join(CONFIGURATION.fixturePath, buildContentsFilename(url, args))
  const optionsFilename = path.join(CONFIGURATION.fixturePath, buildOptionsFilename(url, args))

  // Convert the response body to a Buffer for saving
  return response.clone().buffer()
  .then(function(contentsBuffer) {
    // Write the Response contents
    const contentsPromise = new Promise(function(resolve, reject) {
      fs.writeFile(contentsFilename, contentsBuffer, function(err) {
        if (err) {
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
          return reject(new Error('fetch-vcr ERROR while attempting to save fixture file to ' + optionsFilename + '. Maybe the directory does not exist?'))
        }
        resolve(response)
      })
    })

    return Promise.all([contentsPromise, optionsPromise])
  })
  .then(function() {
    return response
  })
}

function fetchVCR(url, args) {
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
      loadFixture(url, args)
      .then(resolve) // Pass the loaded response back
      .catch(function(err) {
        if (CONFIGURATION.mode === 'cache') {
          // Perform the fetch, save the response, and then yield the original response
          fetchImpl(url, args)
          .catch(reject)
          .then(function(response) {
            saveFixture(url, args, response)
            .then(function(val) {
              resolve(val)
            })
            .catch(reject)
          })
        } else {
          // throw new Error('fetch-vcr ERROR: Fixture file was not found.')
          reject(err) // TODO: Provide a more detailed message
        }
      })
    }
  })
}

fetchVCR.configure = function(config) {
  CONFIGURATION.mode = config.mode || VCR_MODE
  CONFIGURATION.fixturePath = config.fixturePath || CONFIGURATION.fixturePath
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
