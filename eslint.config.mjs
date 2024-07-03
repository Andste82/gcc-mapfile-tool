import globals from "globals";
import js from "@eslint/js";

export default [
	{
		languageOptions: {
			globals: {
				...globals.node,
			},
			sourceType: "module",
		},
	},
	js.configs.recommended,
	{
		rules: {
			// https://eslint.org/docs/latest/rules/
			"no-console": "off",
			"prefer-const": [
				"error",
				{
					destructuring: "any",
					ignoreReadBeforeAssign: false,
				},
			],
			"no-promise-executor-return": ["error", { allowVoid: true }],
			"no-unused-vars": "off",
		},
	},
];
