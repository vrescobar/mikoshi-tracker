import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "apps/api/src/generated/**",
      "**/*.config.{js,mjs,cjs,ts,mts}",
      "eslint.config.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Resolves the right tsconfig per package automatically across the
        // monorepo, and creates inferred projects for files (tests) not listed
        // in any tsconfig.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // React app: hook correctness rules.
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // strictTypeChecked is the baseline. The rules below flag the pre-existing
    // codebase: pure-style ones are turned off, and meaningful ones are kept
    // as warnings (visible backlog) so CI fails only on *new* errors. Tighten
    // these to "error" incrementally as the warnings are driven to zero.
    rules: {
      // Pure style — no bug value here.
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/array-type": "off",
      // Meaningful — kept visible as warnings during adoption.
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-deprecated": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-spread": "warn",
      "@typescript-eslint/no-dynamic-delete": "warn",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "@typescript-eslint/no-empty-function": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
    },
  },
  {
    // Test files are not part of any tsconfig, so type-aware linting cannot
    // resolve a project for them. Lint them syntactically only. This must come
    // after the rule overrides above so type-aware rules stay disabled here.
    files: ["**/test/**", "**/tests/**", "**/*.test.ts", "**/*.spec.ts"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  prettier,
);
