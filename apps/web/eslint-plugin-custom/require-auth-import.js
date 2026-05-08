/** @type {import('eslint').Rule.RuleModule} */
export const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Requires lib/security/auth.ts import in files that perform auth checks",
      category: "Safety",
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      missingImport: "This file appears to perform authentication checks. Import 'lib/security/auth.ts' to ensure consistent auth handling.",
    },
  },
  create(context) {
    let hasAuthImport = false;
    let hasAuthCheck = false;
    
    return {
      ImportDeclaration(node) {
        const authPaths = [
          "lib/security/auth.ts", "lib/security/auth",
          "./auth.ts", "./auth",
          "../security/auth.ts", "../security/auth",
        ];
        // Match both with and without extension (e.g., "lib/security/auth" OR "lib/security/auth.ts")
        const importPath = node.source.value.toLowerCase();
        for (const path of authPaths) {
          if (importPath === path || importPath.endsWith(path + ".ts")) {
            hasAuthImport = true;
            break;
          }
        }
      },
      CallExpression(node) {
        if (!hasAuthImport) {
          if (node.callee.type === "Identifier") {
            const authCheckMethods = [
              "isAuthenticated", "verifyToken", "checkAuth", "hasPermission",
              "isAuthorized", "authenticate", "getAuth", "session",
              "authMiddleware", "requireAuth", "requireAuthz"
            ];
            if (authCheckMethods.includes(node.callee.name)) {
              hasAuthCheck = true;
            }
          }
        }
      },
      "Program:exit"(node) {
        if (!hasAuthImport && hasAuthCheck) {
          context.report({
            node,
            messageId: "missingImport",
            data: {
              filename: context.getFilename(),
            },
          });
        }
      },
    };
  },
};