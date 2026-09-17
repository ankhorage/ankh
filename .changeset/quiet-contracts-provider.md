---
'@ankhorage/ankh': patch
---

Treat `package.json.ankh.provider: null` as authoritative non-provider metadata and invalidate provider catalogs created with the previous `./cli` inference rule.
