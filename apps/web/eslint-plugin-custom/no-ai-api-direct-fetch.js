export const AI_API_PATTERNS = [
  /anthropic\.com/i,
  /googleapis\.com\/v1/i,
  /api\.openai\.com/i,
  /api\.deepseek\.com/i,
  /api\.moonshot\.cn/i,
];
export const ALLOWLIST_SUFFIX = "lib/ai/router.ts";

function isAllowlisted(filename) {
  if (!filename) return false;
  return filename === ALLOWLIST_SUFFIX || filename.endsWith("/" + ALLOWLIST_SUFFIX);
}

function matchesAiPattern(str) {
  const lower = str.toLowerCase();
  return AI_API_PATTERNS.some(p => p.test(lower));
}

export const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbids direct fetch() calls to AI provider APIs except in lib/ai/router.ts",
      category: "Safety",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      forbidden: "Direct fetch() to AI API '{{url}}' is forbidden. Use lib/ai/router.ts for AI service routing.",
    },
  },
  create(context) {
    const filename = context.getFilename ? context.getFilename() : (context.filename ?? "");
    if (isAllowlisted(filename)) return {};

    return {
      CallExpression(node) {
        const calleeType = node.callee.type;
        const isBareIdentifier = calleeType === "Identifier" && node.callee.name === "fetch";
        const isMemberFetch = calleeType === "MemberExpression" && node.callee.property.name === "fetch";
        if (!isBareIdentifier && !isMemberFetch) return;

        const args = node.arguments;
        if (!args || args.length < 1) return;
        const urlArg = args[0];
        if (urlArg.type !== "Literal" || typeof urlArg.value !== "string") return;

        if (matchesAiPattern(urlArg.value)) {
          context.report({ node, messageId: "forbidden", data: { url: urlArg.value } });
        }
      },

      ImportDeclaration(node) {
        if (matchesAiPattern(node.source.value)) {
          context.report({ node, messageId: "forbidden", data: { url: node.source.value } });
        }
      },
    };
  },
};
