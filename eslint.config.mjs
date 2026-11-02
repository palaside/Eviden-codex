import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-dev-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/ocr/**",
    // Local browser/E2E artifacts are not application source and may contain
    // third-party extension bundles that ESLint cannot process reliably.
    ".e2e-chrome-profile/**",
    ".playwright-browsers-task5/**",
    "test-results/**",
    "For Test Results/**",
    "build-output*/**",
  ]),
]);

export default eslintConfig;
