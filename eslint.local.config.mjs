import path from "node:path";
import { fileURLToPath } from "node:url";

import { createConfig } from "@ankhorage/devtools/eslint";

const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default createConfig({
  tsconfigRootDir,
  project: ["./tsconfig.eslint.json"],
  files: ["src/**/*.ts", "tests/**/*.ts", "paradox.config.ts"],
  overrides: [
    {
      files: ["src/**/*.ts", "tests/**/*.ts", "paradox.config.ts"],
      rules: {
        "max-lines-per-function": [
          "error",
          { max: 773, skipBlankLines: true, skipComments: true },
        ],
        "max-lines": [
          "error",
          { max: 890, skipBlankLines: true, skipComments: true },
        ],
        complexity: ["error", { max: 24, variant: "modified" }],
      },
    },
  ],
});
