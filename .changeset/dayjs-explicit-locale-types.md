---
"@esm-repacks/dayjs": patch
---

Remove the ambient locale wildcard so TypeScript rejects nonexistent and unexported locale imports, matching runtime package exports. Preserve standalone locale types and plugin augmentation.
