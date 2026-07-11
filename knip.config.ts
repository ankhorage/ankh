import { createKnipConfig } from "@ankhorage/devtools/knip";

export default createKnipConfig({
  ignoreDependencies: ["@ankhorage/doctor"],
  ignoreFiles: [
    "eslint.config.mjs",
    "paradox.config.ts",
    "src/bin.ts",
    "src/readme-usage.ts",
  ],
});
