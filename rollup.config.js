// This is used for building the ./test/browser-bundle.js for testing
import resolve from 'rollup-plugin-node-resolve'
import commonjs from 'rollup-plugin-commonjs'

export default {
  entry: './lib/index.js',
  plugins: [
    resolve({
      // jsnext: true,
      browser: true
    }),
    commonjs()
  ],
  targets: [
    {
      dest: './browser-bundle.js',
      format: 'umd',
      moduleName: 'fetchVCR',
      sourceMap: true
    }
  ]
}
