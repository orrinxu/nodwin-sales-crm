const FINANCIAL_PATTERNS = [
  "amount", "cost", "revenue", "margin", "price", "fee", "budget",
];

function isFinancial(name) {
  const lower = name.toLowerCase();
  return FINANCIAL_PATTERNS.some(p => lower.includes(p));
}

function findFinancialId(node) {
  if (!node) return null;
  if (node.type === "Identifier" && isFinancial(node.name)) return node.name;
  if (node.type === "BinaryExpression" || node.type === "LogicalExpression") {
    return findFinancialId(node.left) || findFinancialId(node.right);
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbids unsafe numeric coercion on financial fields",
      category: "Safety",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      forbidden: "Unsafe numeric coercion on financial field '{{name}}' detected. Never use Number(), parseFloat, parseInt, +, -, *, /, or toFixed() on money fields. Use dinero.js helpers from lib/money.ts instead.",
    },
  },
  create(context) {
    return {
      // Catch Number/parseInt/parseFloat with a financial variable anywhere in the argument
      // Catch financialVar.toFixed()
      CallExpression(node) {
        // MemberExpression callee: e.g. price.toFixed()
        if (node.callee.type === "MemberExpression") {
          const prop = node.callee.property;
          if (prop.type === "Identifier" && prop.name === "toFixed") {
            const id = findFinancialId(node.callee.object);
            if (id) {
              context.report({ node, messageId: "forbidden", data: { name: id } });
            }
          }
          return;
        }
        if (node.callee.type !== "Identifier") return;
        const callee = node.callee.name;
        if (callee !== "parseInt" && callee !== "parseFloat" && callee !== "Number") return;
        const firstArg = node.arguments[0];
        if (!firstArg) return;
        const id = findFinancialId(firstArg);
        if (id) {
          context.report({ node, messageId: "forbidden", data: { name: id } });
        }
      },

      // Catch: financialVar = +x  OR  financialVar = parseInt/parseFloat/Number(...)
      AssignmentExpression(node) {
        if (node.operator !== "=") return;
        const left = node.left;
        if (!left || left.type !== "Identifier" || !isFinancial(left.name)) return;
        const right = node.right;
        if (!right) return;
        if (right.type === "UnaryExpression" && right.operator === "+") {
          context.report({ node, messageId: "forbidden", data: { name: left.name } });
          return;
        }
        if (right.type === "CallExpression" && right.callee.type === "Identifier") {
          const callee = right.callee.name;
          if (callee === "parseInt" || callee === "parseFloat" || callee === "Number") {
            context.report({ node, messageId: "forbidden", data: { name: left.name } });
          }
        }
      },

      // Catch: const financialVar = +x  OR  const financialVar = parseInt/parseFloat/Number(...)
      VariableDeclarator(node) {
        const id = node.id;
        if (!id || id.type !== "Identifier" || !isFinancial(id.name)) return;
        const init = node.init;
        if (!init) return;
        if (init.type === "UnaryExpression" && init.operator === "+") {
          context.report({ node, messageId: "forbidden", data: { name: id.name } });
          return;
        }
        if (init.type === "CallExpression" && init.callee.type === "Identifier") {
          const callee = init.callee.name;
          if (callee === "parseInt" || callee === "parseFloat" || callee === "Number") {
            context.report({ node, messageId: "forbidden", data: { name: id.name } });
          }
        }
      },

      // Catch: financialVar +/-/\*// anything (unsafe float arithmetic on money)
      BinaryExpression(node) {
        if (!["+", "-", "*", "/"].includes(node.operator) || !node.left || !node.right) return;
        // Skip when already reported by CallExpression (parseInt/parseFloat/Number)
        if (
          node.parent?.type === "CallExpression" &&
          node.parent.callee.type === "Identifier" &&
          ["parseInt", "parseFloat", "Number"].includes(node.parent.callee.name)
        ) {
          return;
        }
        const id = findFinancialId(node.left) || findFinancialId(node.right);
        if (id) {
          context.report({ node, messageId: "forbidden", data: { name: id } });
        }
      },
    };
  },
};
