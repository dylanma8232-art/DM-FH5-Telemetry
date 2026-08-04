import globals from "globals";
import pluginReact from "eslint-plugin-react";

export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true }
      }
    },
    plugins: { react: pluginReact },
    rules: { "no-undef": "error" }
  }
];
