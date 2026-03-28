# Module System Design

## The Scale Problem

When you have 5 modules, you can manage them by hand. When you have 80+, you need a system.

## Module Classification (A-E Series)

We organize modules into 5 series by function:

```
A Series — Content Creation (Writing, Email, PPT, Titles)
B Series — Content Transformation (Rewrite, Expand, Compress, Video→Doc)
C Series — Analysis & Reasoning (CoT, Decision Matrix, Data Insights)
D Series — Research & Extraction (Meeting Summary, Interview, Paper)
E Series — Advanced & Workflow (Workflow Design, Agents, Academic)
```

### Naming Convention

```
[Series Letter][Category Number]-[Sequence Number]

Examples:
A1-01  →  Series A, Category 1, Module 01 (Writing Master)
B2-01  →  Series B, Category 2, Module 01 (Content Expander)
C1-01  →  Series C, Category 1, Module 01 (CoT Analysis)
```

### Why This Scheme?

| Feature | Benefit |
|---------|---------|
| Letter prefix | Instantly know the category |
| Stable IDs | Never change even if labels change |
| Sortable | Natural ordering (A before B) |
| Scalable | Can add A1-99 before needing A2 |
| Language-independent | Works in any locale |

## Three-Layer ID System

The system uses 3 layers of identifiers:

```
Layer 1: Frontend Module ID (human-readable)
  "writing_master", "deep_analysis", "ppt_architect"
         │
         ▼ frontendModuleIdMap
Layer 2: Internal Module ID (shorthand)
  "m1", "m2", "m11"
         │
         ▼ module_mapping + resolvePromptKey
Layer 3: Prompt Key (template reference)
  "A1-01", "C1-01", "A3-01"
         │
         ▼ PROMPT_BANK / MODULE_TEMPLATES
Layer 4: Prompt Template (actual text)
  "You are a professional writing assistant..."
```

### Why Three Layers?

1. **Frontend stability** — `writing_master` never changes in UI code
2. **Internal flexibility** — `m1` can be remapped to different prompt keys
3. **Template independence** — Prompt text can be rewritten without touching any code

## Auto-Generation Pipeline

```
Source Files (human-maintained)
├── moduleOrder.ts          — m1-m31 definitions
├── module_mapping.v2.json  — module → prompt key mapping
└── prompt-bank-src/*.txt   — raw prompt templates
         │
         ▼  npm run gen:mmap / gen:prompt-bank
Generated Files (auto-generated, git-tracked)
├── frontendModuleIdMap.ts   — frontend → internal mapping
├── module-map.generated.ts  — ID → prompt key resolver
├── prompts.generated.ts     — 80+ template strings
└── prompt-bank.generated.ts — core engine prompts
```

### Why Auto-Generate?

| Without generation | With generation |
|-------------------|-----------------|
| Edit 4 files for 1 module change | Edit 1 source file, run `npm run gen` |
| Drift between mapping files | Single source of truth |
| Manual errors in key names | Validated at generation time |
| Hard to audit consistency | Generated files are deterministic |

## Module Definition (JSON)

Each module is defined as a JSON file:

```json
{
  "id": "A1-01",
  "name": "Writing Master",
  "nameCN": "写作大师",
  "category": "content-creation",
  "description": "Professional writing assistant for various formats",
  "inputFormat": "topic, style, length, audience",
  "outputFormat": "structured article with sections",
  "promptTemplate": "You are a professional writing assistant..."
}
```

## Scaling Strategy

| Modules | Strategy |
|---------|----------|
| 1-10 | Hardcode in a single file |
| 10-50 | JSON files + simple loader |
| 50-100 | **Auto-generation pipeline** (current) |
| 100-500 | Database-backed module registry |
| 500+ | Module marketplace with versioning |

We're at the 80-module stage, which is right at the boundary. The next evolution would be moving to a database-backed registry with a management UI.
