var fetch = require('./fetch-browser')

function loadFile(root, filename) {
  return fetch(root + '/' + escape(filename))
  .then(function(response) {
    return response.text()
  })
}

function saveFile(root, filename, buffer) {
  throw new Error('fetch-vcr: Saving Fixture files is not supported in the browser yet')
}

module.exports = {
  loadFile: loadFile,
  saveFile: saveFile
}
