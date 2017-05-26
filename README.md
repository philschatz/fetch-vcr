# fetch-vcr

[![gh-board][kanban-image]][kanban-url]
[![NPM version][npm-image]][npm-url]
[![Downloads][downloads-image]][downloads-url]
[![build status][travis-image]][travis-url]
[![dependency status][dependency-image]][dependency-url]
[![dev dependency status][dev-dependency-image]][dev-dependency-url]

Stop mocking HTTP Requests. Just record and then play them back. See [vcr/vcr](https://github.com/vcr/vcr) for the main idea.

# Usage

After setting up (see below), the basics are:

1. set the `VCR_MODE=cache` environment variable before running your tests
2. run your tests

This will record (and load) all the HTTP responses into the `./_fixtures/` directory.

And when you run the steps again, viola! no network traffic happens.


# What are the different modes?

- `playback`: (default) **only** uses the local fixture files
- `cache`: tries to use the recorded response and if not found then it is fetched and then saved (useful when adding new tests)
- `record`: forces HTTP requests and responses are saved to the filesystem (useful for regenerating all the fixtures)


# How can I set the VCR mode?

You can set the mode either by:

- setting the `VCR_MODE=record` environment variable when running tests (NodeJS)
- explicitly running `fetch.configure({mode: 'record'})` (NodeJS or browser)


# How do I set this up?

There are separate examples for NodeJS, Jest, and in a browser (PhantomJS or Selenium)

## NodeJS Setup

Here is how you would use it in a typical NodeJS app:

```js
// import fetch from 'fetch';
import fetch from 'fetch-vcr';

// Configure where the recordings should be loaded/saved to.
// The path is relative to `process.cwd()` but can be absolute.
fetch.configure({
  fixturePath: './_fixtures',
  // mode: 'record'     <-- This is optional
})

// Use fetch like you would normally
fetch('http://openstax.org')
.then(response => {
  console.log(response.ok)
})
```

## Jest Setup

Just add the following to `package.json`:

```
  "jest": {
    "moduleNameMapper": {
      "fetch": "fetch-vcr"
    }
  }
```

## jsdom Setup

Many apps use `jsdom` for testing which makes it really easy to add `fetch-vcr`. Just replace the global `fetch` function with `fetchVCR` and you can record/play back the cassettes. See below for an example:

```js
var fs = require('fs')
var jsdom = require('jsdom')
var fetchVCR = require('fetch-vcr')

// Configure the path to find cassettes
fetchVCR.configure({
  fixturePath: './_fixtures/'
})

var dom = new jsdom.JSDOM(fs.readFileSync('./jsdom-example.html'), {
  runScripts: 'dangerously',
  beforeParse: (window) => {
    // This changes the fetch global to be fetchVCR
    window.fetch = fetchVCR
  }
})
```


## How can I use this in a browser?

It is easy to record HTTP requests in NodeJS and play them back in the browser.

To play them back in a browser, just run `fetchVCR.configure({fixturePath: './path/to/_fixtures'})` and `fetchVCR` will use that path to load the files via AJAX requests.

To record HTTP requests in a browser you will need to do a little bit of work. Loading fixture files is relatively painless (using `XMLHTTPRequest`) but saving them to disk is non-trivial.

In order to save the fixture files to disk you will need to override `fetchVCR.saveFile(rootPath, filename, contents) => Promise`.

If you are using PhantomJS you will likely need to use the `alert(msg)` to get data out of PhantomJS and then save it to the filesystem (using `fs.writeFile(...)`)



[kanban-image]: https://img.shields.io/github/issues/philschatz/fetch-vcr.svg?label=kanban%20board%20%28gh-board%29
[kanban-url]: http://philschatz.com/gh-board/#/r/philschatz:fetch-vcr
[npm-image]: https://img.shields.io/npm/v/fetch-vcr.svg
[npm-url]: https://npmjs.org/package/fetch-vcr
[downloads-image]: http://img.shields.io/npm/dm/fetch-vcr.svg
[downloads-url]: https://npmjs.org/package/fetch-vcr
[travis-image]: https://img.shields.io/travis/philschatz/fetch-vcr.svg
[travis-url]: https://travis-ci.org/philschatz/fetch-vcr
[dependency-image]: https://img.shields.io/david/philschatz/fetch-vcr.svg
[dependency-url]: https://david-dm.org/philschatz/fetch-vcr
[dev-dependency-image]: https://img.shields.io/david/dev/philschatz/fetch-vcr.svg
[dev-dependency-url]: https://david-dm.org/philschatz/fetch-vcr#info=devDependencies
[coverage-image]: https://img.shields.io/codecov/c/github/philschatz/fetch-vcr.svg
[coverage-url]: https://codecov.io/gh/philschatz/fetch-vcr
