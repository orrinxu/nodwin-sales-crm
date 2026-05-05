const MONEY_LAYER_PATHS = [
  "lib/money.ts",
  "lib/money.test.ts",
]

function isMoneyLayerFile(filename) {
  if (!filename) return false
  return MONEY_LAYER_PATHS.some(
    (p) => filename === p || filename.endsWith("/" + p)
  )
}

function isToDecimalCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "toDecimal"
  )
}

function containsToDecimalCall(node) {
  if (!node) return false
  if (isToDecimalCall(node)) return true
  if (node.type === "CallExpression") {
    return node.arguments.some(containsToDecimalCall)
  }
  if (node.type === "BinaryExpression") {
    return (
      containsToDecimalCall(node.left) || containsToDecimalCall(node.right)
    )
  }
  if (node.type === "MemberExpression") {
    return containsToDecimalCall(node.object)
  }
  return false
}

function isStringLiteral(node) {
  return node.type === "Literal" && typeof node.value === "string"
}

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbids float math on dinero.js decimal values in the money layer",
      category: "Safety",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      forbiddenConversion:
        "Float conversion ({{name}}) on a dinero decimal value is forbidden in the money layer. Pass the decimal string directly to formatting APIs.",
      forbiddenArithmetic:
        "Float arithmetic on a dinero decimal value is forbidden in the money layer. Use dinero.js helpers instead.",
      forbiddenUnary:
        "Unary '+' coercion on a dinero decimal value is forbidden in the money layer.",
    },
  },
  create(context) {
    const filename = context.getFilename
      ? context.getFilename()
      : (context.filename ?? "")
    if (!isMoneyLayerFile(filename)) return {}

    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return
        const name = node.callee.name
        if (name !== "Number" && name !== "parseFloat") return
        const firstArg = node.arguments[0]
        if (firstArg && containsToDecimalCall(firstArg)) {
          context.report({
            node,
            messageId: "forbiddenConversion",
            data: { name },
          })
        }
      },

      UnaryExpression(node) {
        if (node.operator !== "+") return
        if (containsToDecimalCall(node.argument)) {
          context.report({ node, messageId: "forbiddenUnary" })
        }
      },

      BinaryExpression(node) {
        if (!["+", "-", "*", "/"].includes(node.operator)) return
        if (
          !containsToDecimalCall(node.left) &&
          !containsToDecimalCall(node.right)
        ) {
          return
        }
        // Allow string concatenation with a literal string
        if (
          node.operator === "+" &&
          (isStringLiteral(node.left) || isStringLiteral(node.right))
        ) {
          return
        }
        context.report({
          node,
          messageId: "forbiddenArithmetic",
          data: { op: node.operator },
        })
      },
    }
  },
}
