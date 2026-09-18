# Copy review: fibery-120, disposition "nothing-to-carry"

## Summary
Two changes reviewed against voice and casing of existing labels. No issues found.

### 1. `src/report.ts` DISPOSITION_LABEL entry

**New entry:**
```typescript
'nothing-to-carry': 'nothing to carry',
```

**Analysis:**
Consistent with existing simple-concept labels. The compound labels (`lost-*`, `carried-*`) use comma separators; atomic ones (`not-established`, `nothing-to-carry`) don't. Casing and punctuation match: all lowercase, no terminal punctuation. Mirrors voice of `'not-established': 'not established'` — both describe concepts without category-descriptor structure.

### 2. `README.md` disposition table and explanatory paragraph

**New table row:**
```
| `nothing-to-carry` | there was nothing to translate, and nothing was lost |
```

**Analysis:**
Follows voice of existing rows: lowercase, plain descriptive phrase using domain terminology. Verb tense (past) matches `lost-*` entries; "translate" and "lost" are established terms in the surrounding text about compilation and reporting. No punctuation inconsistencies.

**Paragraph rewrite:**
"The mapping is total over the diagnostic code union, so adding a code without classifying it fails the build rather than resolving to `not-established` — and `not-established` means the construct was genuinely never ruled on, never that a loss went unasserted."

Matches the terminology and reasoning already present in `src/report.ts` comments (e.g. "Total over `DiagnosticCode`"). Voice remains consistent: clear, matter-of-fact explanation. No casings or tone breaks.

---

**Result:** No findings. Copy is consistent with existing voice, casing, and terminology.
