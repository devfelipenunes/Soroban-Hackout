import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "src/contracts/**", "public/**", "scripts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-control-regex": "off",
      "no-undef": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "warn",
    },
  },
);
