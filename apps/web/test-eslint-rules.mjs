/* eslint-disable @typescript-eslint/no-require-imports, node/no-process-exit */
const { rules } = require('./eslint-rules.mjs');
const { Linter } = require('eslint');

const linter = new Linter({
  rules: {
    'no-implicit-coercion': rules.noImplicitCoercion,
    'no-remote-fetch': rules.noRemoteFetch,
    'require-auth-import': rules.requireAuthImport,
  },
});

const code = `
const total = amount + 0;
const price = Number(userPrice);
const revenue = parseFloat(data.revenue);
fetch('https://api.openai.com/endpoint');
checkAuth(session);
`;

const messages = linter.verify(code, {});

console.log('Messages:', JSON.stringify(messages, null, 2));

if (messages.length > 0) {
  console.log('PASS: Violating snippet was caught');
  process.exit(0);
} else {
  console.log('FAIL: Violating snippet was not caught');
  process.exit(1);
}
