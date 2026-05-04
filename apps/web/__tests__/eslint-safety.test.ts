import { ESLint } from "eslint";
import { describe, it, expect, beforeAll } from "vitest";

describe("ESLint Safety Rules", () => {
  let eslint: ESLint;

  beforeAll(async () => {
    const customPlugin = (await import("file:///home/orrin/nodwin-sales-crm/apps/web/eslint-plugin-custom/index.js")).plugin;
    eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [{
        files: ["**"],
        plugins: {
          custom: customPlugin,
        },
        rules: {
          "custom/no-unsafe-numeric-coercion": "error",
          "custom/no-ai-api-direct-fetch": "error",
          "custom/require-auth-import": "error",
        },
      }],
    });
  });

  describe("no-unsafe-numeric-coercion", () => {
    it("should catch + coercion on price field", async () => {
      const code = `
        const discount = 10;
        const total = price + discount;
      `;
      const results = await eslint.lintText(code, { filePath: "app/cart.tsx" });
      expect(results[0].errorCount).toBe(1);
      expect(results[0].messages[0].ruleId).toBe("custom/no-unsafe-numeric-coercion");
    });

    it("should catch parseInt on margin field", async () => {
      const code = `
        const margin = 0.20;
        const result = parseInt(margin * 100);
      `;
      const results = await eslint.lintText(code, { filePath: "app/pricing.tsx" });
      expect(results[0].errorCount).toBe(1);
      expect(results[0].messages[0].ruleId).toBe("custom/no-unsafe-numeric-coercion");
    });

    it("should allow Number() on price field", async () => {
      const code = `
        const input = "100";
        const price = Number(input);
      `;
      const results = await eslint.lintText(code, { filePath: "app/cart.tsx" });
      expect(results[0].errorCount).toBe(0);
    });

    it("should not flag non-financial fields", async () => {
      const code = `
        const count = 10;
        const total = count + 5;
      `;
      const results = await eslint.lintText(code, { filePath: "app/items.tsx" });
      expect(results[0].errorCount).toBe(0);
    });
  });

  describe("no-ai-api-direct-fetch", () => {
    it("should catch direct fetch to anthropic.com", async () => {
      const code = `
        const response = await fetch("https://api.anthropic.com/v1/messages");
      `;
      const results = await eslint.lintText(code, { filePath: "app/api.ts" });
      expect(results[0].errorCount).toBe(1);
      expect(results[0].messages[0].ruleId).toBe("custom/no-ai-api-direct-fetch");
    });

    it("should catch direct fetch to openai.com", async () => {
      const code = `
        const response = await fetch("https://api.openai.com/v1/chat/completions");
      `;
      const results = await eslint.lintText(code, { filePath: "app/api.ts" });
      expect(results[0].errorCount).toBe(1);
      expect(results[0].messages[0].ruleId).toBe("custom/no-ai-api-direct-fetch");
    });

    it("should allow fetch to non-AI APIs", async () => {
      const code = `
        const response = await fetch("https://api.stripe.com/v1");
      `;
      const results = await eslint.lintText(code, { filePath: "app/api.ts" });
      expect(results[0].errorCount).toBe(0);
    });

    it("should allow direct AI fetch in lib/ai/router.ts (allowlisted)", async () => {
      const code = `
        const response = await fetch("https://api.anthropic.com/v1/messages");
      `;
      const results = await eslint.lintText(code, { filePath: "lib/ai/router.ts" });
      expect(results[0].errorCount).toBe(0);
    });

    it("should flag direct AI fetch in non-router files", async () => {
      const code = `
        const response = await fetch("https://api.anthropic.com/v1/messages");
      `;
      const results = await eslint.lintText(code, { filePath: "app/api.ts" });
      expect(results[0].errorCount).toBe(1);
      expect(results[0].messages[0].ruleId).toBe("custom/no-ai-api-direct-fetch");
    });
  });

  describe("require-auth-import", () => {
    it("should flag file using isAuthenticated without import", async () => {
      const code = `
        export function protect() {
          return isAuthenticated();
        }
      `;
      const results = await eslint.lintText(code, { filePath: "app/middleware.ts" });
      expect(results[0].errorCount).toBe(1);
      expect(results[0].messages[0].ruleId).toBe("custom/require-auth-import");
    });

    it("should not flag file with auth import", async () => {
      const code = `
        import { isAuthenticated } from "lib/security/auth";
        
        export function protect() {
          return isAuthenticated();
        }
      `;
      const results = await eslint.lintText(code, { filePath: "app/middleware.ts" });
      expect(results[0].errorCount).toBe(0);
    });

    it("should not flag file without auth checks", async () => {
      const code = `
        export function getData() {
          return { id: 1, name: "test" };
        }
      `;
      const results = await eslint.lintText(code, { filePath: "app/data.ts" });
      expect(results[0].errorCount).toBe(0);
    });
  });
});
