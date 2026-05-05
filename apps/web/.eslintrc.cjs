/* eslint-disable @typescript-eslint/no-require-imports -- require() is correct for .cjs config files */
const { rules } = require('./eslint-rules.mjs');

/** @type {import('eslint').Linter.Config} */
const config = {
  extends: ['eslint-config-next'],
  parserOptions: { ecmaVersion: 2026 },
  plugins: { safety: require('./eslint-rules.mjs') },
  rules: {
    'no-implicit-coercion': rules.noImplicitCoercion,
    'no-remote-fetch': rules.noRemoteFetch,
    'require-auth-import': rules.requireAuthImport,
  },
};

module.exports = config;
