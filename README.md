# fetch-vcr

Stop mocking tests and just record and then play them back. See [vcr/vcr](https://github.com/vcr/vcr) for the main idea.

# Usage

The basics are:

1. turn on `cache` mode
2. run your tests

This will record (and load) all the HTTP responses into the `./_fixtures/` directory.

And when you run the steps again, no network traffic happens.

# How do I set this up?

```js
// import fetch from 'fetch';
import fetch from 'fetch-vcr';

// Configure what mode this VCR is in (playback, recording, cache)
// and where the recordings should be loaded/saved to.
fetch.configure({
  mode: 'record',
  fixturePath: __dirname + '/_fixtures'
})

fetch('http://openstax.org')
.then(response => {
  response.text()
  .then(text => {
    console.log(text)
  })
})
```


# What are the different modes?

- `playback`: (default) **only** uses the local fixture files
- `cache`: tries to use the fixture and if not found then it is fetched and then saved (useful when adding new tests)
- `record`: forces files to be written (useful for regenerating all the fixtures)
- `erase`: deletes the fixture corresponding to the request


# How can I set the VCR mode?

You can set the mode either by:

- setting the `VCR_MODE=record` environment variable
- explicitly running `fetch.configure({mode: 'record'})`
