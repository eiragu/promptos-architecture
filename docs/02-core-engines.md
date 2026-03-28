# 5 Core Engines Design

## Philosophy

Instead of building one general-purpose AI engine, we split AI capabilities into 5 specialized engines. Each engine is optimized for a specific cognitive pattern.

## The 5 Engines

### 1. Task Breakdown Engine

**Purpose:** Decompose complex tasks into actionable steps.

**When to use:** User has a big goal but doesn't know where to start.

**Input example:** "Launch an e-commerce website"

**Output pattern:**
```
Step 1: Define product catalog (2 days)
  - List all products
  - Write descriptions
  - Take photos
Step 2: Choose platform (1 day)
  - Compare Shopify vs WooCommerce
  ...
```

### 2. CoT (Chain-of-Thought) Reasoning Engine

**Purpose:** Deep analysis through structured reasoning chains.

**When to use:** User needs to make a decision or understand a complex topic.

**Input example:** "Should we expand to Southeast Asian markets?"

**Output pattern:**
```
Reasoning Chain:
1. Market Size Analysis → ...
2. Competition Landscape → ...
3. Regulatory Environment → ...
4. Cost Structure → ...
Conclusion: ...
```

### 3. Content Builder Engine

**Purpose:** Generate structured content with format control.

**When to use:** User needs to create content (articles, emails, reports).

**Input example:** "Write a product launch announcement email"

**Output pattern:** Formatted content following specified structure and tone.

### 4. Analytical Engine

**Purpose:** MECE analysis, data interpretation, insight extraction.

**When to use:** User has data or a situation that needs structured analysis.

**Input example:** "Analyze our Q4 sales decline"

**Output pattern:**
```
Analysis Framework: MECE
Dimension 1: Product Mix → ...
Dimension 2: Market Conditions → ...
Dimension 3: Operational Issues → ...
Key Insights: ...
Recommendations: ...
```

### 5. Task Tree Engine

**Purpose:** Create hierarchical task structures.

**When to use:** User needs to visualize project structure or dependencies.

**Input example:** "Map out the mobile app development project"

**Output pattern:**
```
Mobile App
├── Design Phase
│   ├── User Research
│   ├── Wireframes
│   └── UI Design
├── Development
│   ├── Frontend
│   ├── Backend
│   └── API Integration
└── Launch
    ├── Testing
    ├── App Store Submission
    └── Marketing
```

## Tier System

Each engine supports **Basic** and **Pro** tiers:

| Aspect | Basic | Pro |
|--------|-------|-----|
| Response depth | Concise, actionable | Comprehensive, detailed |
| Use case | Quick tasks, real-time | Deep analysis, premium |
| Token usage | Lower | Higher |
| Latency | Faster | Slower |

## Engine Composition

The real power comes from **composing** engines:

```
User: "I want to start a coffee shop"

1. Task Breakdown → Project plan with phases
2. Analytical Engine → Market analysis (location, competition)
3. Content Builder → Business plan document
4. CoT Reasoning → Financial viability analysis
5. Task Tree → Implementation roadmap
```

This composition turns a vague request into a complete, actionable output.

## Core Map Design

Engines are defined declaratively in a core map:

```typescript
const CORE_DEFINITIONS = {
  task_breakdown: {
    id: "task_breakdown",
    label: "Task Breakdown",
    prompts: {
      basic: "core.task_breakdown_engine.basic",
      pro: "core.task_breakdown_engine.pro",
    },
  },
  // ... other engines
};
```

This makes the system **data-driven** — adding a new engine is a config change, not a code change.

## Execution Flow

```
POST /api/core/run { coreKey, tier, userInput }
         │
         ▼
  Bootstrap validation (once)
         │
         ▼
  Resolve: coreKey + tier → promptKey
         │
         ▼
  Verify promptKey exists in PROMPT_BANK
         │
         ▼
  Build final prompt: template + userInput
         │
         ▼
  Call LLM provider
         │
         ▼
  Return structured response
```
