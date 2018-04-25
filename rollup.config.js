// This is used for building the ./test/browser-bundle.js for testing
import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'

export default {
  input: './lib/index.js',
  plugins: [
    resolve({
      // jsnext: true,
      browser: true
    }),
    commonjs()
  ],
  output: [
    {
      file: './browser-bundle.js',
      format: 'umd',
      name: 'fetchVCR',
      sourcemap: true
    }
  ]
}
