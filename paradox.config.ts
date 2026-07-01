import { defineParadoxConfig } from "@ankhorage/paradox";

export default defineParadoxConfig({
  mode: "write",
  docs: {
    title: "@ankhorage/ankh",
    description:
      "Bun-first Ankh CLI front door and command bus bootstrap package.",
    usage: {
      entrypoints: ["src/readme-usage.ts"],
    },
  },
  package: {
    entrypoints: ["src/index.ts"],
  },
  output: {
    dir: "paradox",
  },
});
