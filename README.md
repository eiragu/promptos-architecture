# Promptos Architecture

> How I built a multi-engine AI prompt system that powers 80+ content generation modules — from zero to production.

[中文版本](#中文版本) | [English Version](#overview)

---

## Overview

**Promptos** is the AI engine behind [FuYouAI](https://fuyouai.com) — a structured content generation platform. This repository documents the architecture, design decisions, and lessons learned from building a production prompt orchestration system.

### What This Repo Covers

- **Multi-Engine Architecture** — How to design a system that supports multiple LLM providers (DeepSeek, Gemini, and more)
- **5 Core AI Engines** — Task Breakdown, CoT Reasoning, Content Builder, Analytical Engine, Task Tree
- **Module System** — How to organize and manage 80+ prompt modules at scale
- **Prompt Resolution** — Flexible key resolution with multiple naming conventions and fallbacks
- **Production Patterns** — Error handling, validation, feature flags, and observability

### Who Is This For

- Developers building AI-powered applications
- Teams designing prompt management systems
- Anyone interested in production AI architecture

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [LLM Provider Abstraction](#2-llm-provider-abstraction)
3. [5 Core Engines](#3-five-core-engines)
4. [Module System Design](#4-module-system-design)
5. [Prompt Resolution Strategy](#5-prompt-resolution-strategy)
6. [API Layer Design](#6-api-layer-design)
7. [Production Patterns](#7-production-patterns)
8. [Code Examples](#8-code-examples)
9. [Lessons Learned](#9-lessons-learned)

---

## 1. System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Client Request                         │
│              POST /api/core/run  or  /api/run               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │   API Layer         │
                │   - Auth (API Key)  │
                │   - Error Handling  │
                │   - Request Tracing │
                └─────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   Bootstrap & Validate │
              │   - Config validation  │
              │   - Prompt bank check  │
              └─────────┬─────────────┘
                        │
                        ▼
            ┌─────────────────────────┐
            │   Prompt Resolution      │
            │   - Module ID → Key      │
            │   - Multi-naming support │
            │   - Fallback candidates  │
            └─────────┬───────────────┘
                      │
                      ▼
          ┌───────────────────────────┐
          │   Prompt Builder           │
          │   - Template + User Input  │
          │   - Final prompt assembly  │
          └─────────┬─────────────────┘
                    │
                    ▼
        ┌─────────────────────────────┐
        │   LLM Provider              │
        │   ┌──────────┐ ┌─────────┐  │
        │   │ DeepSeek  │ │ Gemini  │  │
        │   └──────────┘ └─────────┘  │
        │   (Pluggable architecture)   │
        └─────────┬───────────────────┘
                  │
                  ▼
      ┌───────────────────────────────┐
      │   Structured Response          │
      │   - output / text / content    │
      │   - metadata & tracing         │
      └───────────────────────────────┘
```

### Key Design Principles

1. **Separation of Concerns** — Each layer has a single responsibility
2. **Provider Agnostic** — LLM providers are pluggable, not hardcoded
3. **Fail-Fast Validation** — Bootstrap checks catch config errors before they hit production
4. **Graceful Degradation** — Feature flags control which engines are active

---

## 2. LLM Provider Abstraction

The LLM layer abstracts away provider-specific APIs behind a unified interface.

### Architecture

```
┌─────────────────────────────────┐
│         runLLM(input)           │  ← Unified Interface
├─────────────────────────────────┤
│  engineType: "deepseek"|"gemini"│
│  prompt: string                 │
│  temperature?: number           │
└──────────┬──────────────────────┘
           │
     ┌─────┴──────┐
     ▼            ▼
┌─────────┐  ┌─────────┐
│DeepSeek │  │ Gemini  │
│(OpenAI  │  │(Google  │
│ compat) │  │ GenAI)  │
└─────────┘  └─────────┘
```

### Why This Design?

| Decision | Reason |
|----------|--------|
| Single `runLLM()` function | Callers don't need to know which provider is used |
| Result type with `ok` flag | No exceptions for expected failures (missing API key, etc.) |
| OpenAI-compatible SDK for DeepSeek | Many providers support OpenAI format — easy to add more |
| Environment-based config | API keys stay out of code, easy to rotate |

### Code Pattern

```typescript
// Unified input/output types
type RunLLMInput = {
  engineType: "deepseek" | "gemini";
  prompt: string;
  temperature?: number;
};

type RunLLMOutput =
  | { ok: true; engineType: string; text: string }
  | { ok: false; engineType: string; error: string };

// Usage — caller doesn't care about provider internals
const result = await runLLM({
  engineType: "deepseek",
  prompt: finalPrompt,
  temperature: 0.7,
});

if (!result.ok) {
  // Handle error
}
```

### Adding a New Provider

To add a new LLM provider (e.g., Claude, GPT-4), you only need to:

1. Add a new branch in `runLLM()`
2. Add the engine type to the union type
3. Set the API key in environment variables

**No changes needed in the engine layer, API layer, or any other part of the system.**

---

## 3. Five Core Engines

The system is built around 5 fundamental AI engines, each designed for a specific reasoning pattern.

### Engine Overview

```
┌──────────────────────────────────────────────────────────┐
│                    5 Core Engines                         │
├──────────────┬───────────────────────────────────────────┤
│              │                                           │
│  Task        │  Break complex tasks into actionable      │
│  Breakdown   │  steps with dependencies                  │
│              │                                           │
├──────────────┼───────────────────────────────────────────┤
│              │                                           │
│  CoT         │  Chain-of-Thought reasoning for           │
│  Reasoning   │  complex analysis and problem solving     │
│              │                                           │
├──────────────┼───────────────────────────────────────────┤
│              │                                           │
│  Content     │  Structured content generation with       │
│  Builder     │  format control and style consistency     │
│              │                                           │
├──────────────┼───────────────────────────────────────────┤
│              │                                           │
│  Analytical  │  MECE analysis, data interpretation,      │
│  Engine      │  and insight extraction                   │
│              │                                           │
├──────────────┼───────────────────────────────────────────┤
│              │                                           │
│  Task Tree   │  Hierarchical task decomposition          │
│  Engine      │  with tree structure output               │
│              │                                           │
└──────────────┴───────────────────────────────────────────┘
```

### Tier System

Each engine supports multiple tiers for different use cases:

| Tier | Purpose | Use Case |
|------|---------|----------|
| **Basic** | Fast, concise output | Quick tasks, real-time responses |
| **Pro** | Deep, detailed output | Complex analysis, premium features |

### Core Definition Pattern

```typescript
// Each core engine is defined declaratively
type CoreDefinition = {
  id: CoreKey;
  label: string;
  description?: string;
  prompts: Partial<Record<"basic" | "pro", string>>;  // tier → promptKey
};

// Example: Task Breakdown Engine
const taskBreakdown: CoreDefinition = {
  id: "task_breakdown",
  label: "Task Breakdown",
  prompts: {
    basic: "core.task_breakdown_engine.basic",
    pro: "core.task_breakdown_engine.pro",
  },
};
```

### Why 5 Engines?

These 5 engines cover the fundamental patterns of AI-assisted work:

| Pattern | Engine | Real-World Example |
|---------|--------|--------------------|
| **Decompose** | Task Breakdown | "Plan a product launch" → 12 actionable steps |
| **Reason** | CoT Reasoning | "Should we enter market X?" → structured analysis |
| **Create** | Content Builder | "Write a blog post about Y" → formatted content |
| **Analyze** | Analytical Engine | "Analyze these sales numbers" → insights + charts |
| **Structure** | Task Tree | "Map out the project" → hierarchical tree |

Together, they form a **complete cognitive toolkit** that can be composed for complex workflows.

---

## 4. Module System Design

### The Challenge

How do you manage 80+ different prompt modules (writing, analysis, marketing, coding, etc.) without creating chaos?

### Our Solution: Hierarchical Module Organization

```
Module System
├── A Series — Content Creation
│   ├── A1-01  Writing Master
│   ├── A1-02  Email Expert
│   ├── A1-03  Title Generator
│   └── ...
├── B Series — Content Transformation
│   ├── B1-01  Rewriter
│   ├── B2-01  Expander
│   └── ...
├── C Series — Analysis & Reasoning
│   ├── C1-01  CoT Deep Analysis
│   ├── C2-01  Decision Matrix
│   └── ...
├── D Series — Research & Extraction
│   ├── D1-01  Meeting Summary
│   ├── D2-01  Interview Generator
│   └── ...
└── E Series — Advanced & Workflow
    ├── E1-01  Workflow Designer
    ├── E2-01  Role-Playing Agent
    └── ...
```

### Module ID Mapping

The system supports multiple ways to reference the same module:

```
Frontend ID:    "writing_master"     (human-readable)
       ↓
Module ID:      "m1"                 (internal shorthand)
       ↓
Prompt Key:     "A1-01"              (template reference)
       ↓
Template:       Full prompt text     (actual content)
```

### Why This Design?

| Problem | Solution |
|---------|----------|
| Frontend uses readable names | `frontendModuleIdMap` translates to internal IDs |
| Backend needs stable keys | Prompt keys (A1-01) never change |
| Modules grow over time | Series-based grouping scales naturally |
| Multiple naming conventions exist | Resolution layer tries all candidates |

### 31 Production Modules

| # | Module | Category |
|---|--------|----------|
| m1 | Writing Master | Content Creation |
| m2 | Deep Analysis | Analysis |
| m3 | Researcher | Research |
| m4 | Market Insights | Business |
| m5 | Paper Reader | Academic |
| m6 | Academic Study | Academic |
| m7 | Data Interpreter | Analysis |
| m8 | Interview Generator | Research |
| m9 | Summarizer | Transformation |
| m10 | Decision Maker | Analysis |
| m11 | PPT Architect | Content Creation |
| m12 | Email Pro | Content Creation |
| m13 | Copywriter | Marketing |
| m14 | Pitch Deck | Business |
| m15 | Product Spec | Product |
| m16 | Course Design | Education |
| m17 | Explainer | Education |
| m18 | Role-Playing | Creative |
| m19 | Storyteller | Creative |
| m20 | Rewriter | Transformation |
| m21 | SOP Engine | Workflow |
| m22 | PM/OKR | Management |
| m23 | Business Model | Business |
| m24 | Tech Stack | Engineering |
| m25 | Debugger | Engineering |
| m26 | Meta-Prompt | AI/Prompt |
| m27 | Multi-Agent | AI/Agent |
| m28 | No-Code Automation | Automation |
| m29 | Risk Control | Safety |
| m30 | Knowledge Base | Knowledge |
| m31 | Smart Editor | Editing |

---

## 5. Prompt Resolution Strategy

### The Problem

In a growing system, the same module can be referenced in many ways:
- `task_breakdown` (core key)
- `task_breakdown_engine` (engine name)
- `core.task_breakdown_engine.basic` (full qualified)
- `task_breakdown/basic` (directory style)

### The Solution: Candidate-Based Resolution

```
Input: coreKey="task_breakdown", tier="basic"
                    │
                    ▼
        Generate Candidates:
        ┌─────────────────────────────────────┐
        │ 1. task_breakdown.basic             │
        │ 2. core.task_breakdown.basic        │
        │ 3. task_breakdown_engine.basic      │
        │ 4. core.task_breakdown_engine.basic │ ← Match!
        │ 5. task_breakdown/basic             │
        │ 6. core/task_breakdown/basic        │
        │ ...                                 │
        └─────────────────────────────────────┘
                    │
                    ▼
        Found in PROMPT_BANK → Return promptKey
```

### Key Design Decisions

| Decision | Why |
|----------|-----|
| Try multiple candidates | Supports legacy + new naming without migration |
| Return `tried` array on failure | Makes debugging easy ("I tried these 12 keys, none matched") |
| Deduplicate candidates | Performance — don't check the same key twice |
| Fail with detailed error | Developer knows exactly what went wrong |

### Code Pattern

```typescript
function resolveCorePromptKey(coreKey: string, tier: string) {
  const candidates = [
    `${coreKey}.${tier}`,
    `core.${coreKey}.${tier}`,
    `${coreKey}_engine.${tier}`,
    `core.${coreKey}_engine.${tier}`,
    // ... more patterns
  ];

  const tried = [];
  for (const k of new Set(candidates)) {
    tried.push(k);
    if (promptBankHasKey(k)) {
      return { ok: true, promptKey: k, tried };
    }
  }

  return { ok: false, error: `Not found. Tried: ${tried.join(", ")}`, tried };
}
```

---

## 6. API Layer Design

### Endpoint Structure

```
/api/
├── core/run     POST  — Execute core engines (5 engines × 2 tiers)
├── run          POST  — Execute any prompt module (80+ modules)
├── generate     POST  — Simple generation endpoint
├── registry     GET   — List available modules
└── ping         GET   — Health check
```

### Request Flow

```typescript
// POST /api/core/run
{
  "coreKey": "task_breakdown",    // Which engine
  "tier": "basic",                // Which tier
  "userInput": "Plan a website",  // User's input
  "engineType": "deepseek"        // Which LLM
}

// Response
{
  "ok": true,
  "output": "1. Define requirements...",
  "text": "1. Define requirements...",      // Alias
  "content": "1. Define requirements...",   // Alias
  "modelOutput": "1. Define requirements...", // Alias
  "meta": {
    "requestId": "uuid-...",
    "coreKey": "task_breakdown",
    "tier": "basic",
    "engineType": "deepseek",
    "promptKey": "core.task_breakdown_engine.basic"
  }
}
```

### Why Multiple Output Aliases?

```
output, text, content, modelOutput — all contain the same value
```

This is intentional for **backwards compatibility**. Different frontend versions expect different field names. Instead of breaking old clients, we return all aliases. Cost: ~0 (just string references). Benefit: zero frontend breakage.

---

## 7. Production Patterns

### 7.1 Feature Flags

```typescript
// Environment-based feature flags with flexible parsing
function envOn(name: string): boolean {
  const v = String(process.env[name] ?? "").toLowerCase().trim();
  return ["1", "true", "on", "yes"].includes(v);
}

// Usage: gradually roll out new engine versions
if (envOn("ENGINE_PROVIDER_V2")) {
  return runPromptModuleV2(key, input, engine);
}
return runPromptModuleLegacy(key, input, engine);
```

### 7.2 Bootstrap Validation

```
Server Start
     │
     ▼
bootstrapCore()
     │
     ├─ Check CORE_ENGINE_NAME is valid object
     ├─ Check PROMPT_BANK is loaded and non-empty
     ├─ Validate core definitions match prompt bank
     │
     ├─ All OK → Continue (runs once, cached)
     └─ Error → Throw immediately (fail-fast)
```

### 7.3 Error Categorization

```typescript
// Categorize errors for actionable debugging
const code =
  /api key|unauthorized/i.test(msg) ? "UPSTREAM_AUTH" :
  /timeout/i.test(msg)              ? "UPSTREAM_TIMEOUT" :
  /ECONNREFUSED|network/i.test(msg) ? "UPSTREAM_NETWORK" :
  /json/i.test(msg)                 ? "JSON_PARSE" :
  "INTERNAL";

// Each code has a human-readable hint
// "UPSTREAM_AUTH" → "Check model API Key / BaseURL"
// "UPSTREAM_TIMEOUT" → "Check network or increase timeout"
```

### 7.4 Request Tracing

Every request gets a unique `requestId` that flows through all layers:

```
Client → API (requestId=abc) → Engine (requestId=abc) → LLM → Response (requestId=abc)
```

This makes debugging production issues straightforward — search logs by `requestId`.

### 7.5 Timing-Safe Authentication

```typescript
// Prevent timing attacks on API key comparison
import { timingSafeEqual } from "crypto";

const a = Buffer.from(token, "utf-8");
const b = Buffer.from(expected, "utf-8");
if (a.length !== b.length) return false;
return timingSafeEqual(a, b);
```

---

## 8. Code Examples

### Example 1: Add a New Core Engine

```typescript
// 1. Add to core-map.ts
export const CORE_ENGINE_NAME = {
  // ... existing engines
  translation: "translation_engine",  // New!
};

// 2. Add definition
export const CORE_DEFINITIONS = {
  // ... existing
  translation: {
    id: "translation",
    label: "Translation",
    prompts: {
      basic: "core.translation_engine.basic",
      pro: "core.translation_engine.pro",
    },
  },
};

// 3. Add prompt template to prompt bank
// 4. Done — resolution, execution, API all work automatically
```

### Example 2: Add a New LLM Provider

```typescript
// In provider.ts — add one branch
if (engineType === "claude") {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return { ok: false, engineType, error: "Missing CLAUDE_API_KEY" };

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  return { ok: true, engineType, text: message.content[0].text };
}
```

### Example 3: Add a New Module

```typescript
// 1. Create module definition JSON in /public/modules/
// 2. Add to moduleOrder.ts
{ m: "m32", frontModuleId: "translator", labelCN: "翻译", labelEN: "Translator" }

// 3. Run code generation
npm run gen:mmap
npm run gen:prompt-bank

// 4. Module is now available via API
```

---

## 9. Lessons Learned

### What Worked

| Decision | Impact |
|----------|--------|
| Unified LLM interface | Switched from DeepSeek to Gemini in 10 minutes |
| Code generation from source files | Single source of truth, no drift |
| Candidate-based resolution | Zero migration needed when renaming |
| Feature flags for engine versions | Safe rollout of V2 engine |
| Multiple output aliases | Zero frontend breakage during refactors |

### What I'd Do Differently

| Area | Current | Better Approach |
|------|---------|-----------------|
| Prompt storage | Generated TypeScript files | Database or CMS for hot-reload |
| Module config | JSON files in `/public` | API-driven module registry |
| Error handling | String pattern matching | Typed error classes |
| Testing | Manual via test page | Automated prompt regression tests |

### Key Takeaways

1. **Start with the prompt, not the code** — The prompt template is your product. Code is just plumbing.
2. **Design for multiple LLMs from day one** — Provider lock-in is real. Abstraction is cheap.
3. **Invest in resolution/mapping early** — Naming conventions WILL change. Build flexibility in.
4. **Auto-generate, don't hand-maintain** — 80 modules × manual updates = guaranteed drift.
5. **Feature flags save deployments** — Rolling back a flag is faster than rolling back code.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| LLM SDKs | OpenAI SDK (DeepSeek), Google GenAI (Gemini) |
| Deployment | Vercel |
| Rate Limiting | Upstash Redis |
| Styling | Tailwind CSS 4 |

---

## Related

- [FuYouAI](https://fuyouai.com) — The production application powered by this architecture
- [promptos-starter](https://github.com/fysd032/promptos-starter) — Starter template based on this architecture

---

## License

MIT

---

## Author

Built by [Eira](https://github.com/fysd032) — 10 years in financial sales, now building AI products.

If you found this useful, a star would be appreciated!

---

<a name="中文版本"></a>

# 中文版本

## Promptos 架构设计文档

> 我如何构建一个支持 80+ 内容生成模块的多引擎 AI Prompt 系统 — 从零到生产环境的完整记录。

### 这个仓库包含什么

这不是一个可运行的项目，而是一份**架构设计文档**，记录了我在构建 [FuYouAI](https://fuyouai.com) 过程中的技术决策和经验教训。

### 核心内容

1. **多引擎架构** — 如何设计支持多个 LLM 提供商的系统
2. **5 大核心引擎** — 任务拆解、CoT 推理、内容生成、分析引擎、任务树
3. **模块系统** — 如何组织和管理 80+ 个 Prompt 模块
4. **Prompt 解析策略** — 灵活的 key 解析机制，支持多种命名约定
5. **生产环境实践** — 错误处理、验证、功能开关、可观测性

### 适合谁看

- 正在构建 AI 应用的开发者
- 需要设计 Prompt 管理系统的团队
- 对生产环境 AI 架构感兴趣的任何人

详细内容请参考上方英文文档，包含完整的架构图、代码示例和经验总结。

---

_Star this repo if you find it helpful!_
