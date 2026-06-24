export default {
  arrowParens: 'avoid',
  bracketSameLine: true,
  bracketSpacing: true,
  plugins: ['prettier-plugin-packagejson', 'prettier-plugin-sh', 'prettier-plugin-tailwindcss'],
  printWidth: 120,
  semi: false,
  singleQuote: true,
  tailwindAttributes: ['classNames', 'className'],
  tailwindFunctions: ['clsx', 'cn', 'cva'],
  trailingComma: 'all',
}
