import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import security from "eslint-plugin-security";
import node from "eslint-plugin-n";
import { plugin } from "./eslint-plugin-custom/index.js";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Security-focused ESLint plugins
  {
    plugins: {
      security,
      node,
    },
    rules: {
     // Security rules from eslint-plugin-security
      "security/detect-bidi-characters": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "error",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-eval-with-expression": "error",
      "security/detect-new-buffer": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-non-literal-fs-filename": "error",
      "security/detect-non-literal-regexp": "error",
      "security/detect-non-literal-require": "error",
      "security/detect-object-injection": "error",
      "security/detect-possible-timing-attacks": "error",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",

      // Node.js specific safety rules from eslint-plugin-n
      "node/no-deprecated-api": "error",
      "node/no-exports-assign": "error",
      "node/no-new-require": "error",
      "node/no-process-env": "error",
      "node/no-process-exit": "error",
      "node/no-unpublished-import": "error",
      "node/no-unpublished-require": "error",
      "node/prefer-global/buffer": ["error", "always"],
      "node/prefer-global/console": "error",
      "node/prefer-global/process": "error",
      "node/prefer-global/url-search-params": "error",
      "node/prefer-global/url": "error",
      "node/process-exit-as-throw": "error",
    },
  },
  // Custom business safety rules
  {
    plugins: {
      custom: plugin,
    },
    rules: {
      // Ban numeric coercion on financial fields
      "custom/no-unsafe-numeric-coercion": "error",
      
      // Ban direct fetch() to AI APIs (except lib/ai/router.ts)
      "custom/no-ai-api-direct-fetch": "error",
      
      // Require auth import in auth-checking files
      "custom/require-auth-import": "error",
      
      // Forbid float math on dinero.js values in the money layer
      "custom/no-float-math-in-money-layer": "error",
    },
  },
  // env.ts is the single designated point of process.env access.
  // All other files must import from here instead of reading process.env directly.
  {
    files: ["lib/security/env.ts"],
    rules: {
      "node/no-process-env": "off",
    },
  },
  // AI provider adapters read optional API keys from process.env to determine availability.
  // These files are the only place direct AI API access is allowed.
  {
    files: ["lib/ai/providers/*.ts"],
    rules: {
      "node/no-process-env": "off",
    },
  },
  // Client-side files that need NEXT_PUBLIC_ env vars (Next.js inlines these at build time).
  {
    files: ["lib/supabase/client.ts", "app/(auth)/login/page.tsx"],
    rules: {
      "node/no-process-env": "off",
    },
  },
  // Test files that manipulate process.env for test scenarios.
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "node/no-process-env": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
