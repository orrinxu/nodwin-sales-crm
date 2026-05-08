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

function isStringLiteral(node) {
  return node.type === "Literal" && typeof node.value === "string"
}

function isIntegerLiteral(node) {
  return node.type === "Literal" && Number.isInteger(node.value)
}

function isBigIntLiteral(node) {
  if (node.type === "BigIntLiteral") return true
  if (node.type === "Literal" && typeof node.value === "bigint") return true
  if (node.type === "Literal" && node.bigint !== undefined) return true
  return false
}

function isBigIntCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "Identifier" &&
    node.callee.name === "BigInt"
  )
}

function isToAmountOrToDecimalCall(node) {
  if (node.type !== "CallExpression") return false
  const callee = node.callee
  if (callee.type === "Identifier") {
    return callee.name === "toDecimal"
  }
  if (callee.type === "MemberExpression") {
    const prop = callee.property
    if (prop.type === "Identifier") {
      return prop.name === "toAmount" || prop.name === "toDecimal"
    }
  }
  return false
}

/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbids float math and conversions in the money layer. Use bigint or dinero.js helpers instead.",
      category: "Safety",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      forbiddenConversion:
        "Float conversion ({{name}}) is forbidden in the money layer. Use bigint or dinero.js helpers instead.",
      forbiddenArithmetic:
        "Float arithmetic ({{op}}) is forbidden in the money layer. Use bigint or dinero.js helpers instead.",
      forbiddenUnary:
        "Unary '+' coercion is forbidden in the money layer.",
      forbiddenMathPow:
        "Math.pow() is forbidden in the money layer. Use bigint power functions instead.",
      forbiddenCast:
        "Casting a decimal string to number is forbidden in the money layer. Pass the string directly or use a bigint-safe formatter.",
    },
  },
  create(context) {
    const filename = context.getFilename
      ? context.getFilename()
      : (context.filename ?? "")
    if (!isMoneyLayerFile(filename)) return {}

    return {
      CallExpression(node) {
        if (node.callee.type === "Identifier") {
          const name = node.callee.name
          if (name === "parseFloat" || name === "parseInt") {
            context.report({
              node,
              messageId: "forbiddenConversion",
              data: { name },
            })
            return
          }
          if (name === "Number") {
            // Number() direct call — e.g. Number(x), Number(result)
            // Static methods like Number.isInteger are MemberExpressions, not caught here.
            context.report({
              node,
              messageId: "forbiddenConversion",
              data: { name },
            })
            return
          }
        }

        if (
          node.callee.type === "MemberExpression" &&
          node.callee.object.type === "Identifier" &&
          node.callee.object.name === "Math" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "pow"
        ) {
          context.report({ node, messageId: "forbiddenMathPow" })
        }
      },

      UnaryExpression(node) {
        if (node.operator !== "+") return
        context.report({ node, messageId: "forbiddenUnary" })
      },

      BinaryExpression(node) {
        if (!["+", "-", "*", "/"].includes(node.operator)) return


        // Allow string concatenation with a literal string
        if (
          node.operator === "+" &&
          (isStringLiteral(node.left) || isStringLiteral(node.right))
        ) {
          return
        }

        // Allow operations involving at least one bigint literal or BigInt() call
        if (
          isBigIntLiteral(node.left) ||
          isBigIntLiteral(node.right) ||
          isBigIntCall(node.left) ||
          isBigIntCall(node.right)
        ) {
          return
        }

        // Allow + and - when at least one side is an integer literal
        // (safe for index arithmetic like dotIndex + 1)
        if (
          (node.operator === "+" || node.operator === "-") &&
          (isIntegerLiteral(node.left) || isIntegerLiteral(node.right))
        ) {
          return
        }

        context.report({
          node,
          messageId: "forbiddenArithmetic",
          data: { op: node.operator },
        })
      },

      TSAsExpression(node) {
        // Only report on the cast that targets number
        if (node.typeAnnotation.type !== "TSNumberKeyword") return

        // Walk through any intermediate casts (e.g. as unknown as number)
        let inner = node.expression
        while (inner.type === "TSAsExpression") {
          inner = inner.expression
        }

        if (isToAmountOrToDecimalCall(inner)) {
          context.report({ node, messageId: "forbiddenCast" })
        }
      },
    }
  },
}
