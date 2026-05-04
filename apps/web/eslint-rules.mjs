const AMOUNT_REGEX = /amount|cost|revenue|margin|price|fee|budget/i;

/** @type {import('eslint').Linter.RuleModule} */
const noImplicitCoercion = {
  create() {
    return {
      BinaryExpression(node) {
        if (node.operator === '+' && node.right.type === 'Literal' && node.right.value === 0) {
          const id = node.left.type === 'Identifier' ? node.left.name : null;
          if (id && AMOUNT_REGEX.test(id)) {
            return node.left;
          }
        }
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' &&
          ['Number', 'parseFloat', 'parseInt'].includes(node.callee.name)) {
          const arg = node.arguments[0];
          if (arg?.type === 'Identifier' && AMOUNT_REGEX.test(arg.name)) {
            return arg;
          }
        }
      },
    };
  },
  meta: { docsUrl: '' },
};

/** @type {import('eslint').Linter.RuleModule} */
const noRemoteFetch = {
  create() {
    const forbidden = [
      '*.anthropic.com',
      '*.googleapis.com/v1',
      'api.openai.com',
      'api.deepseek.com',
      'api.moonshot.cn',
    ];
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'fetch') {
          const arg = node.arguments[0];
          if (arg?.type === 'Literal' && typeof arg.value === 'string') {
            const url = arg.value;
            if (forbidden.some(f => url.includes(f))) {
              return node;
            }
          }
        }
      },
    };
  },
  meta: { docsUrl: '' },
};

/** @type {import('eslint').Linter.RuleModule} */
const requireAuthImport = {
  create() {
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier' &&
          ['checkAuth', 'validateSession', 'verifyToken'].includes(node.callee.name)) {
          const id = node.callee.name;
          return id;
        }
      },
    };
  },
  meta: { docsUrl: '' },
};

module.exports = {
  noImplicitCoercion,
  noRemoteFetch,
  requireAuthImport,
};
