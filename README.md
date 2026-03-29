# Promptos Architecture

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![LLM Providers](https://img.shields.io/badge/LLM_Providers-DeepSeek%20%7C%20Gemini-orange.svg)](#2-llm-provider-abstraction)
[![Modules](https://img.shields.io/badge/Prompt_Modules-80%2B-purple.svg)](#4-module-system-design)

> **A production-grade multi-engine AI prompt orchestration architecture** that powers 80+ content generation modules — from zero to production.

**Promptos** is an open-source prompt orchestration system and multi-LLM management framework designed for building scalable AI content generation platforms. It provides a pluggable architecture for managing multiple LLM providers, structured prompt templates, and modular AI engines.

[中文版本](#中文版本) | [English Version](#overview)

---

## Overview

**Promptos** is the AI engine behind [FuYouAI](https://fuyouai.com) — a structured AI content generation platform. This repository documents the architecture, design decisions, and lessons learned from building a production prompt orchestration system with multi-LLM support.

### What This Repo Covers

- **Multi-LLM Provider Architecture** — How to design a pluggable system that supports multiple LLM providers (DeepSeek, Gemini, Claude, GPT-4, and more)
- **5 Core AI Engines** — Task Breakdown, Chain-of-Thought Reasoning, Content Builder, Analytical Engine, Task Tree
- **Prompt Module System** — How to organize and manage 80+ prompt modules at scale with automatic code generation
- **Prompt Resolution & Routing** — Flexible key resolution with multiple naming conventions and fallback strategies
- **Production Patterns** — Error handling, validation, feature flags, observability, and timing-safe authentication

### Who Is This For

- Developers building AI-powered applications who need a prompt management framework
- Teams designing prompt orchestration systems for multi-LLM environments
- Anyone interested in production AI architecture and prompt engineering at scale

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

- [FuYouAI](https://fuyouai.com) — The production AI content generation platform powered by this architecture
- [promptos-starter](https://github.com/eiragu/promptos-starter) — Starter template based on this prompt orchestration architecture

---

## License

MIT

---

## Author

Built by [Eira](https://github.com/eiragu) — 10 years in financial sales, now building AI products.

If you found this useful, a star would be appreciated!

---

<a name="中文版本"></a>

# 中文版本

## Promptos 架构设计文档 — 多引擎 AI Prompt 编排系统

> 我如何构建一个支持 80+ 内容生成模块的多引擎 AI Prompt 编排系统 — 从零到生产环境的完整架构记录。

### 这个仓库包含什么

这是一份**生产级 AI Prompt 编排架构设计文档**，记录了我在构建 [FuYouAI](https://fuyouai.com)（AI 内容生成平台）过程中的技术决策和经验教训。适用于需要管理多个大模型（LLM）、多 Prompt 模板、多引擎的 AI 应用场景。

### 核心内容

1. **多大模型（LLM）接入架构** — 如何设计支持 DeepSeek、Gemini、Claude 等多个 AI 大模型的可插拔系统
2. **5 大核心 AI 引擎** — 任务拆解引擎、CoT 链式推理引擎、内容生成引擎、数据分析引擎、任务树引擎
3. **Prompt 模块管理系统** — 如何组织和管理 80+ 个 Prompt 模板模块，支持自动代码生成
4. **Prompt 解析与路由策略** — 灵活的 key 解析机制，支持多种命名约定和降级策略
5. **生产环境最佳实践** — 错误处理、启动校验、功能开关、请求追踪、安全认证

### 适合谁看

- 正在构建 AI 应用、需要 Prompt 管理框架的开发者
- 需要设计多模型 Prompt 编排系统的技术团队
- 对生产环境 AI 架构和大规模 Prompt 工程感兴趣的任何人

### 关键词

`Prompt 编排` `多大模型管理` `AI 内容生成` `LLM 架构` `Prompt 工程` `AI 应用开发` `大模型切换` `Prompt 模板管理`

---

### 目录

1. [系统架构](#1-系统架构)
2. [LLM 大模型接入层](#2-llm-大模型接入层)
3. [5 大核心引擎](#3-五大核心引擎)
4. [模块系统设计](#4-模块系统设计)
5. [Prompt 解析策略](#5-prompt-解析策略)
6. [API 接口层设计](#6-api-接口层设计)
7. [生产环境实践](#7-生产环境实践)
8. [代码示例](#8-代码示例)
9. [经验总结](#9-经验总结)

---

### 1. 系统架构

#### 整体架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                      客户端请求                               │
│              POST /api/core/run  或  /api/run                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │   API 接口层         │
                │   - 身份认证 (API Key)│
                │   - 错误处理         │
                │   - 请求追踪         │
                └─────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   启动校验 & 配置验证   │
              │   - 配置项检查         │
              │   - Prompt 库校验      │
              └─────────┬─────────────┘
                        │
                        ▼
            ┌─────────────────────────┐
            │   Prompt 解析层          │
            │   - 模块 ID → Key 映射   │
            │   - 多命名约定支持       │
            │   - 降级候选策略         │
            └─────────┬───────────────┘
                      │
                      ▼
          ┌───────────────────────────┐
          │   Prompt 构建器            │
          │   - 模板 + 用户输入        │
          │   - 最终 Prompt 组装       │
          └─────────┬─────────────────┘
                    │
                    ▼
        ┌─────────────────────────────┐
        │   大模型（LLM）接入层        │
        │   ┌──────────┐ ┌─────────┐  │
        │   │ DeepSeek  │ │ Gemini  │  │
        │   └──────────┘ └─────────┘  │
        │   （可插拔架构，易于扩展）     │
        └─────────┬───────────────────┘
                  │
                  ▼
      ┌───────────────────────────────┐
      │   结构化响应                    │
      │   - output / text / content   │
      │   - 元数据 & 请求追踪          │
      └───────────────────────────────┘
```

#### 核心设计原则

1. **职责分离** — 每一层只负责一件事
2. **模型无关** — 大模型提供商可插拔，不硬编码
3. **快速失败** — 启动时就检测配置错误，不留到生产环境
4. **优雅降级** — 功能开关控制引擎的开启和关闭

---

### 2. LLM 大模型接入层

LLM 接入层将不同大模型厂商的 API 抽象成统一接口。

#### 架构图

```
┌─────────────────────────────────┐
│         runLLM(input)           │  ← 统一接口
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
│ 兼容)    │  │ GenAI)  │
└─────────┘  └─────────┘
```

#### 为什么这样设计？

| 设计决策 | 原因 |
|----------|------|
| 单一 `runLLM()` 函数 | 调用方无需知道使用的是哪个大模型 |
| `ok` 标志的结果类型 | 预期错误（如缺少 API Key）不抛异常 |
| DeepSeek 使用 OpenAI 兼容 SDK | 很多厂商支持 OpenAI 格式，便于扩展 |
| 环境变量配置 | API Key 不入代码，方便轮换 |

#### 代码模式

```typescript
// 统一的输入/输出类型
type RunLLMInput = {
  engineType: "deepseek" | "gemini";
  prompt: string;
  temperature?: number;
};

type RunLLMOutput =
  | { ok: true; engineType: string; text: string }
  | { ok: false; engineType: string; error: string };

// 使用示例 — 调用方不关心底层是哪个模型
const result = await runLLM({
  engineType: "deepseek",
  prompt: finalPrompt,
  temperature: 0.7,
});

if (!result.ok) {
  // 处理错误
}
```

#### 添加新的大模型提供商

要接入一个新的 LLM（如 Claude、GPT-4），只需要：

1. 在 `runLLM()` 中添加一个新的分支
2. 在联合类型中添加新的引擎类型
3. 在环境变量中设置 API Key

**引擎层、API 层或系统其他部分完全不需要改动。**

---

### 3. 五大核心引擎

系统围绕 5 个基础 AI 引擎构建，每个引擎针对特定的推理模式。

#### 引擎概览

```
┌──────────────────────────────────────────────────────────┐
│                    5 大核心引擎                            │
├──────────────┬───────────────────────────────────────────┤
│              │                                           │
│  任务拆解     │  将复杂任务拆解为可执行的步骤，               │
│  引擎        │  包含依赖关系                               │
│              │                                           │
├──────────────┼───────────────────────────────────────────┤
│              │                                           │
│  CoT 推理    │  链式思维推理，用于复杂分析                   │
│  引擎        │  和问题求解                                 │
│              │                                           │
├──────────────┼───────────────────────────────────────────┤
│              │                                           │
│  内容生成     │  结构化内容生成，                            │
│  引擎        │  支持格式控制和风格一致性                     │
│              │                                           │
├──────────────┼───────────────────────────────────────────┤
│              │                                           │
│  分析引擎     │  MECE 分析、数据解读                        │
│              │  和洞察提取                                 │
│              │                                           │
├──────────────┼───────────────────────────────────────────┤
│              │                                           │
│  任务树       │  层级化任务分解，                            │
│  引擎        │  输出树形结构                               │
│              │                                           │
└──────────────┴───────────────────────────────────────────┘
```

#### 层级系统

每个引擎支持多个层级，适用于不同场景：

| 层级 | 用途 | 使用场景 |
|------|------|----------|
| **Basic（基础）** | 快速、简洁的输出 | 快速任务、实时响应 |
| **Pro（专业）** | 深度、详细的输出 | 复杂分析、高级功能 |

#### 核心定义模式

```typescript
// 每个核心引擎采用声明式定义
type CoreDefinition = {
  id: CoreKey;
  label: string;
  description?: string;
  prompts: Partial<Record<"basic" | "pro", string>>;  // 层级 → promptKey
};

// 示例：任务拆解引擎
const taskBreakdown: CoreDefinition = {
  id: "task_breakdown",
  label: "Task Breakdown",
  prompts: {
    basic: "core.task_breakdown_engine.basic",
    pro: "core.task_breakdown_engine.pro",
  },
};
```

#### 为什么是 5 个引擎？

这 5 个引擎覆盖了 AI 辅助工作的基本模式：

| 模式 | 引擎 | 实际案例 |
|------|------|----------|
| **分解** | 任务拆解 | "策划一次产品发布" → 12 个可执行步骤 |
| **推理** | CoT 推理 | "我们是否应该进入 X 市场？" → 结构化分析 |
| **创作** | 内容生成 | "写一篇关于 Y 的博客" → 格式化内容 |
| **分析** | 分析引擎 | "分析这些销售数据" → 洞察 + 图表 |
| **结构化** | 任务树 | "梳理整个项目" → 层级树形图 |

这 5 个引擎组合在一起，构成了一个**完整的认知工具集**，可以组合使用以完成复杂工作流。

---

### 4. 模块系统设计

#### 挑战

如何管理 80+ 个不同的 Prompt 模块（写作、分析、营销、编程等）而不陷入混乱？

#### 解决方案：层级化模块组织

```
模块系统
├── A 系列 — 内容创作
│   ├── A1-01  写作大师
│   ├── A1-02  邮件专家
│   ├── A1-03  标题生成器
│   └── ...
├── B 系列 — 内容转换
│   ├── B1-01  改写器
│   ├── B2-01  扩展器
│   └── ...
├── C 系列 — 分析与推理
│   ├── C1-01  CoT 深度分析
│   ├── C2-01  决策矩阵
│   └── ...
├── D 系列 — 研究与提取
│   ├── D1-01  会议摘要
│   ├── D2-01  访谈生成器
│   └── ...
└── E 系列 — 高级与工作流
    ├── E1-01  工作流设计器
    ├── E2-01  角色扮演代理
    └── ...
```

#### 模块 ID 映射

系统支持多种方式引用同一个模块：

```
前端 ID:     "writing_master"     （人类可读）
       ↓
模块 ID:     "m1"                 （内部简称）
       ↓
Prompt Key:  "A1-01"              （模板引用）
       ↓
模板:         完整的 Prompt 文本    （实际内容）
```

#### 为什么这样设计？

| 问题 | 解决方案 |
|------|----------|
| 前端使用可读名称 | `frontendModuleIdMap` 转换为内部 ID |
| 后端需要稳定的 key | Prompt Key（A1-01）永不改变 |
| 模块会持续增长 | 系列化分组天然可扩展 |
| 存在多种命名约定 | 解析层尝试所有候选项 |

#### 31 个生产模块

| # | 模块 | 分类 |
|---|------|------|
| m1 | 写作大师 | 内容创作 |
| m2 | 深度分析 | 分析 |
| m3 | 研究员 | 研究 |
| m4 | 市场洞察 | 商业 |
| m5 | 论文阅读器 | 学术 |
| m6 | 学术研究 | 学术 |
| m7 | 数据解读 | 分析 |
| m8 | 访谈生成器 | 研究 |
| m9 | 摘要器 | 转换 |
| m10 | 决策者 | 分析 |
| m11 | PPT 架构师 | 内容创作 |
| m12 | 邮件专家 | 内容创作 |
| m13 | 文案撰写 | 营销 |
| m14 | 商业计划书 | 商业 |
| m15 | 产品规格 | 产品 |
| m16 | 课程设计 | 教育 |
| m17 | 讲解器 | 教育 |
| m18 | 角色扮演 | 创意 |
| m19 | 故事家 | 创意 |
| m20 | 改写器 | 转换 |
| m21 | SOP 引擎 | 工作流 |
| m22 | 项目管理/OKR | 管理 |
| m23 | 商业模式 | 商业 |
| m24 | 技术栈 | 工程 |
| m25 | 调试器 | 工程 |
| m26 | 元提示 | AI/Prompt |
| m27 | 多智能体 | AI/Agent |
| m28 | 无代码自动化 | 自动化 |
| m29 | 风险管控 | 安全 |
| m30 | 知识库 | 知识 |
| m31 | 智能编辑器 | 编辑 |

---

### 5. Prompt 解析策略

#### 问题

在不断增长的系统中，同一个模块可能有多种引用方式：
- `task_breakdown`（核心 key）
- `task_breakdown_engine`（引擎名称）
- `core.task_breakdown_engine.basic`（完全限定名）
- `task_breakdown/basic`（目录风格）

#### 解决方案：基于候选项的解析

```
输入: coreKey="task_breakdown", tier="basic"
                    │
                    ▼
        生成候选项:
        ┌─────────────────────────────────────┐
        │ 1. task_breakdown.basic             │
        │ 2. core.task_breakdown.basic        │
        │ 3. task_breakdown_engine.basic      │
        │ 4. core.task_breakdown_engine.basic │ ← 匹配!
        │ 5. task_breakdown/basic             │
        │ 6. core/task_breakdown/basic        │
        │ ...                                 │
        └─────────────────────────────────────┘
                    │
                    ▼
        在 PROMPT_BANK 中找到 → 返回 promptKey
```

#### 关键设计决策

| 决策 | 原因 |
|------|------|
| 尝试多个候选项 | 支持旧命名 + 新命名，无需迁移 |
| 失败时返回 `tried` 数组 | 便于调试（"我尝试了这 12 个 key，都没匹配"） |
| 候选项去重 | 性能优化 — 不重复检查同一个 key |
| 失败时给出详细错误 | 开发者能精确知道哪里出了问题 |

#### 代码模式

```typescript
function resolveCorePromptKey(coreKey: string, tier: string) {
  const candidates = [
    `${coreKey}.${tier}`,
    `core.${coreKey}.${tier}`,
    `${coreKey}_engine.${tier}`,
    `core.${coreKey}_engine.${tier}`,
    // ... 更多模式
  ];

  const tried = [];
  for (const k of new Set(candidates)) {
    tried.push(k);
    if (promptBankHasKey(k)) {
      return { ok: true, promptKey: k, tried };
    }
  }

  return { ok: false, error: `未找到。已尝试: ${tried.join(", ")}`, tried };
}
```

---

### 6. API 接口层设计

#### 接口结构

```
/api/
├── core/run     POST  — 执行核心引擎（5 引擎 × 2 层级）
├── run          POST  — 执行任意 Prompt 模块（80+ 模块）
├── generate     POST  — 简单生成接口
├── registry     GET   — 列出可用模块
└── ping         GET   — 健康检查
```

#### 请求流程

```typescript
// POST /api/core/run
{
  "coreKey": "task_breakdown",    // 选择引擎
  "tier": "basic",                // 选择层级
  "userInput": "策划一个网站",     // 用户输入
  "engineType": "deepseek"        // 选择大模型
}

// 响应
{
  "ok": true,
  "output": "1. 明确需求...",
  "text": "1. 明确需求...",         // 别名
  "content": "1. 明确需求...",      // 别名
  "modelOutput": "1. 明确需求...",  // 别名
  "meta": {
    "requestId": "uuid-...",
    "coreKey": "task_breakdown",
    "tier": "basic",
    "engineType": "deepseek",
    "promptKey": "core.task_breakdown_engine.basic"
  }
}
```

#### 为什么有多个输出别名？

```
output, text, content, modelOutput — 都包含相同的值
```

这是有意为之的**向后兼容**设计。不同版本的前端期望不同的字段名。与其破坏旧客户端，不如返回所有别名。成本：约为 0（只是字符串引用）。收益：零前端破坏。

---

### 7. 生产环境实践

#### 7.1 功能开关

```typescript
// 基于环境变量的功能开关，支持灵活解析
function envOn(name: string): boolean {
  const v = String(process.env[name] ?? "").toLowerCase().trim();
  return ["1", "true", "on", "yes"].includes(v);
}

// 使用示例：逐步发布新引擎版本
if (envOn("ENGINE_PROVIDER_V2")) {
  return runPromptModuleV2(key, input, engine);
}
return runPromptModuleLegacy(key, input, engine);
```

#### 7.2 启动校验

```
服务器启动
     │
     ▼
bootstrapCore()
     │
     ├─ 检查 CORE_ENGINE_NAME 是有效对象
     ├─ 检查 PROMPT_BANK 已加载且非空
     ├─ 验证核心定义与 Prompt 库匹配
     │
     ├─ 全部通过 → 继续（只运行一次，结果缓存）
     └─ 错误 → 立即抛出（快速失败）
```

#### 7.3 错误分类

```typescript
// 对错误进行分类，便于精准排查
const code =
  /api key|unauthorized/i.test(msg) ? "UPSTREAM_AUTH" :
  /timeout/i.test(msg)              ? "UPSTREAM_TIMEOUT" :
  /ECONNREFUSED|network/i.test(msg) ? "UPSTREAM_NETWORK" :
  /json/i.test(msg)                 ? "JSON_PARSE" :
  "INTERNAL";

// 每个错误码对应人类可读的提示
// "UPSTREAM_AUTH" → "请检查模型 API Key / BaseURL"
// "UPSTREAM_TIMEOUT" → "请检查网络或增加超时时间"
```

#### 7.4 请求追踪

每个请求都会分配一个唯一的 `requestId`，贯穿所有层级：

```
客户端 → API (requestId=abc) → 引擎 (requestId=abc) → LLM → 响应 (requestId=abc)
```

排查生产问题时，按 `requestId` 搜索日志即可。

#### 7.5 时序安全认证

```typescript
// 防止 API Key 比对的时序攻击
import { timingSafeEqual } from "crypto";

const a = Buffer.from(token, "utf-8");
const b = Buffer.from(expected, "utf-8");
if (a.length !== b.length) return false;
return timingSafeEqual(a, b);
```

---

### 8. 代码示例

#### 示例 1：添加新的核心引擎

```typescript
// 1. 添加到 core-map.ts
export const CORE_ENGINE_NAME = {
  // ... 已有引擎
  translation: "translation_engine",  // 新引擎！
};

// 2. 添加定义
export const CORE_DEFINITIONS = {
  // ... 已有
  translation: {
    id: "translation",
    label: "Translation",
    prompts: {
      basic: "core.translation_engine.basic",
      pro: "core.translation_engine.pro",
    },
  },
};

// 3. 在 Prompt 库中添加模板
// 4. 完成 — 解析、执行、API 全部自动生效
```

#### 示例 2：接入新的大模型

```typescript
// 在 provider.ts 中 — 添加一个分支
if (engineType === "claude") {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return { ok: false, engineType, error: "缺少 CLAUDE_API_KEY" };

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  return { ok: true, engineType, text: message.content[0].text };
}
```

#### 示例 3：添加新模块

```typescript
// 1. 在 /public/modules/ 创建模块定义 JSON
// 2. 添加到 moduleOrder.ts
{ m: "m32", frontModuleId: "translator", labelCN: "翻译", labelEN: "Translator" }

// 3. 运行代码生成
npm run gen:mmap
npm run gen:prompt-bank

// 4. 模块现已通过 API 可用
```

---

### 9. 经验总结

#### 做对了什么

| 决策 | 效果 |
|------|------|
| 统一的 LLM 接口 | 10 分钟内从 DeepSeek 切换到 Gemini |
| 从源文件自动生成代码 | 单一真相来源，无漂移 |
| 基于候选项的解析 | 重命名时零迁移成本 |
| 引擎版本的功能开关 | 安全地发布 V2 引擎 |
| 多输出别名 | 重构期间零前端破坏 |

#### 如果重来会怎么做

| 方面 | 现状 | 更好的方案 |
|------|------|-----------|
| Prompt 存储 | 生成的 TypeScript 文件 | 数据库或 CMS，支持热更新 |
| 模块配置 | `/public` 中的 JSON 文件 | API 驱动的模块注册中心 |
| 错误处理 | 字符串模式匹配 | 类型化的错误类 |
| 测试 | 通过测试页手动测试 | 自动化的 Prompt 回归测试 |

#### 核心收获

1. **先写 Prompt，再写代码** — Prompt 模板才是你的产品，代码只是管道。
2. **从第一天就支持多模型** — 大模型锁定是真实存在的，抽象的成本很低。
3. **尽早投资解析/映射层** — 命名约定一定会变，提前构建灵活性。
4. **自动生成，不要手动维护** — 80 个模块 × 手动更新 = 必然漂移。
5. **功能开关拯救部署** — 回滚一个开关比回滚代码快得多。

---

### 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript 5 |
| 大模型 SDK | OpenAI SDK (DeepSeek)、Google GenAI (Gemini) |
| 部署 | Vercel |
| 限流 | Upstash Redis |
| 样式 | Tailwind CSS 4 |

---

### 相关链接

- [FuYouAI](https://fuyouai.com) — 基于此架构的生产级 AI 内容生成平台
- [promptos-starter](https://github.com/eiragu/promptos-starter) — 基于此 Prompt 编排架构的入门模板

---

### 作者

由 [Eira](https://github.com/eiragu) 构建 — 10 年金融销售经验，现在构建 AI 产品。

如果觉得有用，欢迎给个 Star！

---

_Star this repo if you find it helpful!_
