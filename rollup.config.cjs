/* eslint-disable import/no-extraneous-dependencies */
const { nodeResolve } = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');

module.exports = {
  input: 'src/index.js',
  treeshake: { moduleSideEffects: false },
  output: [
    {
      file: 'dist/index.js',
      format: 'esm',
      exports: 'named',
      sourcemap: false,
    },
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      exports: 'named',
      sourcemap: false,
    },
  ],
  plugins: [nodeResolve(), commonjs()],
  external: ['three', /^three\/addons\//, 'sdf-parser'],
  onwarn(warning, warn) {
    // Suppress eval warnings from some deps.
    if (warning.code === 'EVAL') return;
    warn(warning);
  },
}; 