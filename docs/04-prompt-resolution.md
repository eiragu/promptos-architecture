# Prompt Resolution Strategy

## The Naming Problem

As the system evolved, the same engine acquired multiple names:

```
Version 1:  "task_breakdown"
Version 2:  "task_breakdown_engine"
Version 3:  "core.task_breakdown_engine.basic"
Directory:  "core/task_breakdown_engine/basic"
```

Renaming all references across frontend, backend, config files, and database would be a massive migration. Instead, we built a **resolution layer**.

## Candidate-Based Resolution

The resolver generates all possible key variations and checks them one by one:

```typescript
function resolveCorePromptKey(coreKey: string, tier: string) {
  const engineName = CORE_ENGINE_NAME[coreKey]; // e.g., "task_breakdown_engine"

  const candidates = [
    // Direct
    `${coreKey}.${tier}`,            // task_breakdown.basic
    `core.${coreKey}.${tier}`,       // core.task_breakdown.basic

    // With engine suffix
    `${coreKey}_engine.${tier}`,     // task_breakdown_engine.basic
    `core.${coreKey}_engine.${tier}`, // core.task_breakdown_engine.basic

    // From core-map
    `${engineName}.${tier}`,         // task_breakdown_engine.basic
    `core.${engineName}.${tier}`,    // core.task_breakdown_engine.basic

    // Directory style
    `${coreKey}/${tier}`,            // task_breakdown/basic
    `core/${coreKey}/${tier}`,       // core/task_breakdown/basic
    // ... more patterns
  ];

  // Deduplicate and search
  for (const k of new Set(candidates)) {
    if (PROMPT_BANK.hasOwnProperty(k)) {
      return { ok: true, promptKey: k };
    }
  }

  return { ok: false, error: "Not found", tried: candidates };
}
```

## Why This Approach?

### Alternative 1: Strict Naming Convention

```
✗ Requires migrating all existing keys
✗ Breaks when someone uses the wrong format
✗ Every rename is a breaking change
```

### Alternative 2: Alias Table

```
✗ Manual maintenance of alias mappings
✗ Can drift from actual keys
✗ Another file to keep in sync
```

### Our Approach: Candidate Generation

```
✓ Zero migration needed
✓ Supports any naming convention
✓ Self-healing (finds the key wherever it is)
✓ Detailed error reporting (shows what was tried)
```

## Error Reporting

When resolution fails, the error includes all attempted candidates:

```json
{
  "ok": false,
  "error": "Unknown promptKey for coreKey=\"translation\", tier=\"basic\"",
  "tried": [
    "translation.basic",
    "core.translation.basic",
    "translation_engine.basic",
    "core.translation_engine.basic",
    "translation/basic",
    "core/translation/basic"
  ]
}
```

This makes debugging trivial — you can immediately see:
1. What key format the system expected
2. Whether it's a typo, missing prompt, or naming mismatch

## Module-Level Resolution

For the 80+ general modules, resolution goes through an additional mapping layer:

```
Frontend: "writing_master"
    ↓ frontendModuleIdMap
Internal: "m1"
    ↓ resolvePromptKey({ moduleId: "m1" })
Prompt Key: "A1-01"
    ↓ MODULE_TEMPLATES["A1-01"]
Template: "You are a professional writing assistant..."
```

## Performance

- Candidate generation: ~0.01ms (string concatenation)
- Hash lookup per candidate: ~0.001ms
- Total resolution: < 0.1ms (negligible vs. LLM call latency of 1-30s)

Resolution cost is invisible in practice.
