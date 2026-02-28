import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import unicorn from "eslint-plugin-unicorn";
import sonarjs from "eslint-plugin-sonarjs";

const eslintConfig = [
  // ─── Base Next.js config (react, react-hooks, @next/next, jsx-a11y) ─────────
  ...nextCoreWebVitals,
  ...nextTypescript,

  // ─── TypeScript strict type-checked presets ──────────────────────────────────
  // strictTypeChecked includes all of strict + rules that need type information.
  // stylisticTypeChecked adds consistent code style with type awareness.
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Parser options required for type-checked rules (tsc integration)
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // ─── TypeScript rule overrides ───────────────────────────────────────────────
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // Unused vars → error with underscore escape hatch
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Enforce `import type` for type-only imports
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // Require explicit return types on exported/public functions
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
          allowIIFEs: true,
        },
      ],

      // Naming conventions
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "interface", format: ["PascalCase"] },
        { selector: "typeAlias", format: ["PascalCase"] },
        { selector: "enum", format: ["PascalCase"] },
        { selector: "enumMember", format: ["UPPER_CASE", "PascalCase"] },
        { selector: "class", format: ["PascalCase"] },
        {
          selector: "variable",
          format: ["camelCase", "PascalCase", "UPPER_CASE"],
          leadingUnderscore: "allow",
        },
        {
          selector: "function",
          format: ["camelCase", "PascalCase"],
        },
        {
          selector: "parameter",
          format: ["camelCase"],
          leadingUnderscore: "allow",
        },
      ],

      // Next.js server components are async — allow void return on JSX attributes
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],

      // Allow non-null assertions only when clearly intentional
      "@typescript-eslint/no-non-null-assertion": "error",

      // Require awaiting all promises
      "@typescript-eslint/no-floating-promises": "error",

      // Ban unsafe any usage
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",

      // Prefer nullish coalescing and optional chaining
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",

      // Exhaustive switch statements
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },

  // ─── Unicorn — opinionated best practices ────────────────────────────────────
  unicorn.configs["recommended"],
  {
    rules: {
      // React returns null — null is part of the language
      "unicorn/no-null": "off",

      // Next.js uses both kebab-case (routes/pages) and PascalCase (components)
      "unicorn/filename-case": [
        "error",
        { cases: { kebabCase: true, pascalCase: true } },
      ],

      // Keep abbreviations commonly used in React / Node.js / Next.js ecosystems
      "unicorn/prevent-abbreviations": [
        "error",
        {
          replacements: {
            props: false,
            ref: false,
            refs: false,
            params: false,
            args: false,
            cb: false,
            ctx: false,
            req: false,
            res: false,
            err: false,
            fn: false,
            dir: false,
            str: false,
            num: false,
            env: false,
            utils: false,
            util: false,
            docs: false,
            doc: false,
            conf: { config: false },
          },
        },
      ],

      // Array.reduce has valid use cases in data transformation pipelines
      "unicorn/no-array-reduce": "off",

      // Next.js API routes do use process.exit in edge cases
      "unicorn/no-process-exit": "off",
    },
  },

  // ─── SonarJS — code quality: complexity, duplication, bugs ──────────────────
  sonarjs.configs.recommended,

  // ─── General strict JavaScript rules ─────────────────────────────────────────
  {
    rules: {
      // No console.log left in production code — use proper logging
      "no-console": "error",

      // Always use strict equality
      eqeqeq: ["error", "always"],

      // No var — use const/let
      "no-var": "error",

      // Prefer const over let when not reassigned
      "prefer-const": "error",

      // Disallow implicit type coercions (Boolean(x) ok, !!x not)
      "no-implicit-coercion": "error",

      // Avoid mutating function parameters (common source of bugs)
      "no-param-reassign": [
        "error",
        {
          props: true,
          ignorePropertyModificationsFor: [
            "acc",
            "accumulator",
            "req",
            "res",
            "state",
          ],
        },
      ],

      // Use shorthand object properties
      "object-shorthand": "error",

      // Prefer destructuring for object properties
      "prefer-destructuring": ["error", { object: true, array: false }],

      // No nested ternary — creates unreadable code
      "no-nested-ternary": "error",

      // Enforce template literals over string concatenation
      "prefer-template": "error",

      // Require default case in switch statements
      "default-case": "error",

      // No unreachable code after return/throw
      "no-unreachable": "error",

      // Disallow duplicate imports
      "no-duplicate-imports": "error",

      // Prefer rest params over arguments object
      "prefer-rest-params": "error",

      // Prefer spread over .apply()
      "prefer-spread": "error",
    },
  },

  // ─── Ignores ──────────────────────────────────────────────────────────────────
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".docshub-cache/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
