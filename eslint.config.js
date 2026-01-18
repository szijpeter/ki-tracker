import globals from "globals";
import pluginJs from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
    { ignores: [".agent/"] },
    { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
    pluginJs.configs.recommended,
    eslintConfigPrettier,
    {
        rules: {
            "no-unused-vars": "warn",
            "no-console": "off"
        }
    }
];
