import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Drawers/forms intentionally re-sync local form state from props when they open
      // or when fetched data arrives. Kept visible as a warning, not a build blocker.
      "react-hooks/set-state-in-effect": "warn",
      // Full page reloads are intentional for login/logout (clears all client state).
      "@next/next/no-location-assign-relative-destination": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
