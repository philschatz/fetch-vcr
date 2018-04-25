// This is so webpack can override this with a browser version
let fetchImpl

// Try to load the hack-node-fetch package because jest allows remapping packages (useful for tests)
try {
  fetchImpl = require('hack-node-fetch')
} catch (err) {
  fetchImpl = require('node-fetch')
}

module.exports = fetchImpl
