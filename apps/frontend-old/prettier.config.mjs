/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
 */
const config = {
	trailingComma: "es5",
	tabWidth: 2,
	useTabs: false,
	semi: true,
	singleQuote: false,
	jsxSingleQuote: false,
	plugins: ["prettier-plugin-tailwindcss"],
};

export default config;
