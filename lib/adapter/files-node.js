// This is so webpack can override this with a browser version
const fs = require('fs')
const path = require('path')

function loadFile(root, filename) {
  return new Promise(function(resolve, reject) {
    fs.readFile(path.join(root, filename), function(err, buffer) {
      if (err) {
        reject(err)
      } else {
        resolve(buffer)
      }
    })
  })
}

function saveFile(root, filename, buffer) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(path.join(root, filename), buffer, function(err) {
      if (err) {
        reject(err)
      } else {
        resolve('fetch-saved')
      }
    })
  })
}

module.exports = {
  loadFile,
  saveFile
}
