import js from "@eslint/js";
import globals from "globals";

export default [
	js.configs.recommended,
	{
		files: ["webapp/**/*.js"],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "script",
			globals: {
				...globals.browser,
				sap: "readonly"
			}
		},
		rules: {
			"no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_" }]
		}
	}
];
