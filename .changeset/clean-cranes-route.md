---
'@ankhorage/ankh': patch
---

Keep concrete Ankh providers out of the published runtime dependency graph so dynamically discovered providers can depend on the shared CLI runtime without cycles.
