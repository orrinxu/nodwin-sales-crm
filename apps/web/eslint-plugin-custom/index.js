import { rule as numericCoercion } from "./numeric-coercion.js";
import { rule as aiApiFetch } from "./no-ai-api-direct-fetch.js";
import { rule as requireAuthImport } from "./require-auth-import.js";
import { rule as noFloatMathInMoneyLayer } from "./no-float-math-in-money-layer.js";

export const plugin = {
  meta: {
    name: "custom",
    version: "1.0.0",
    description: "Custom business safety rules for Nodwin Sales CRM",
  },
  rules: {
    "no-unsafe-numeric-coercion": numericCoercion,
    "no-ai-api-direct-fetch": aiApiFetch,
    "require-auth-import": requireAuthImport,
    "no-float-math-in-money-layer": noFloatMathInMoneyLayer,
  },
};
