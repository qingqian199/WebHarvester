const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ["**/*.js", "dist/", "coverage/", "node_modules/"],
  },
  {
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      semi: ["error", "always"],
      quotes: ["error", "double"],
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "no-magic-numbers": [
        "warn",
        {
          ignoreArrayIndexes: true,
          ignore: [0, 1, -1, 2, 10, 36, 200, 204, 400, 404, 500, 1000, 3000],
          ignoreDefaultValues: true,
          enforceConst: true,
        },
      ],
    },
  },
);
