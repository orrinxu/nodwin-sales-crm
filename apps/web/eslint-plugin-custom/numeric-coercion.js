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
      forbidden: "Unsafe numeric coercion on financial field '{{name}}' detected. Use Number() instead of implicit coercion.",
    },
  },
  create(context) {
    return {
      // Catch parseInt/parseFloat with a financial variable anywhere in the argument
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return;
        const callee = node.callee.name;
        if (callee !== "parseInt" && callee !== "parseFloat") return;
        const firstArg = node.arguments[0];
        if (!firstArg) return;
        const id = findFinancialId(firstArg);
        if (id) {
          context.report({ node, messageId: "forbidden", data: { name: id } });
        }
      },

      // Catch: financialVar = +x  OR  financialVar = parseInt/parseFloat(...)
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
          if (callee === "parseInt" || callee === "parseFloat") {
            context.report({ node, messageId: "forbidden", data: { name: left.name } });
          }
        }
      },

      // Catch: financialVar + anything (binary + coercion)
      BinaryExpression(node) {
        if (node.operator !== "+" || !node.left || !node.right) return;
        const left = node.left;
        if (left.type !== "Identifier" || !isFinancial(left.name)) return;
        context.report({ node, messageId: "forbidden", data: { name: left.name } });
      },
    };
  },
};
