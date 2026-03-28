/**
 * Example: Core Engine Definition & Resolution
 *
 * This shows how the 5 core engines are defined and how
 * prompt keys are resolved using candidate-based matching.
 */

// --- Types ---

type PlanTier = "basic" | "pro";

type CoreKey =
  | "task_breakdown"
  | "cot_reasoning"
  | "content_builder"
  | "analytical_engine"
  | "task_tree";

type CoreDefinition = {
  id: CoreKey;
  label: string;
  prompts: Partial<Record<PlanTier, string>>;
};

// --- Core Definitions (Data-Driven) ---

const CORE_ENGINE_NAME: Record<CoreKey, string> = {
  task_breakdown: "task_breakdown_engine",
  cot_reasoning: "cot_reasoning_engine",
  content_builder: "content_builder_engine",
  analytical_engine: "analytical_engine",
  task_tree: "task_tree_engine",
};

const CORE_DEFINITIONS: Record<CoreKey, CoreDefinition> = {
  task_breakdown: {
    id: "task_breakdown",
    label: "Task Breakdown",
    prompts: {
      basic: "core.task_breakdown_engine.basic",
      pro: "core.task_breakdown_engine.pro",
    },
  },
  cot_reasoning: {
    id: "cot_reasoning",
    label: "CoT Reasoning",
    prompts: { basic: "core.cot_reasoning_engine.basic" },
  },
  content_builder: {
    id: "content_builder",
    label: "Content Builder",
    prompts: { basic: "core.content_builder_engine.basic" },
  },
  analytical_engine: {
    id: "analytical_engine",
    label: "Analytical Engine",
    prompts: { basic: "core.analytical_engine.basic" },
  },
  task_tree: {
    id: "task_tree",
    label: "Task Tree",
    prompts: { basic: "core.task_tree_engine.basic" },
  },
};

// --- Candidate-Based Prompt Resolution ---

/**
 * Resolves a coreKey + tier to a promptKey by trying multiple naming patterns.
 * This avoids the need for strict naming conventions and supports legacy keys.
 */
function resolveCorePromptKey(
  coreKey: string,
  tier: PlanTier,
  promptBank: Record<string, string>
) {
  const engineName = CORE_ENGINE_NAME[coreKey as CoreKey];
  if (!engineName) {
    return { ok: false as const, error: `Unknown coreKey: ${coreKey}`, tried: [] };
  }

  // Generate all possible key patterns
  const candidates = [
    `${coreKey}.${tier}`,
    `core.${coreKey}.${tier}`,
    `${coreKey}_engine.${tier}`,
    `core.${coreKey}_engine.${tier}`,
    `${engineName}.${tier}`,
    `core.${engineName}.${tier}`,
    `${coreKey}/${tier}`,
    `core/${coreKey}/${tier}`,
  ];

  const tried: string[] = [];
  for (const k of new Set(candidates)) {
    tried.push(k);
    if (k in promptBank) {
      return { ok: true as const, promptKey: k, tried };
    }
  }

  return { ok: false as const, error: `Prompt not found for ${coreKey}/${tier}`, tried };
}

// --- Usage Example ---

// Simulated prompt bank
const PROMPT_BANK: Record<string, string> = {
  "core.task_breakdown_engine.basic": "You are a task breakdown specialist...",
  "core.task_breakdown_engine.pro": "You are an expert project planner...",
  "core.cot_reasoning_engine.basic": "You are a reasoning engine...",
  "core.content_builder_engine.basic": "You are a content builder...",
  "core.analytical_engine.basic": "You are an analytical engine...",
  "core.task_tree_engine.basic": "You are a task tree builder...",
};

// Resolve and execute
const resolved = resolveCorePromptKey("task_breakdown", "basic", PROMPT_BANK);

if (resolved.ok) {
  console.log(`Resolved to: ${resolved.promptKey}`);
  console.log(`Template: ${PROMPT_BANK[resolved.promptKey].substring(0, 50)}...`);
} else {
  console.error(`Failed: ${resolved.error}`);
  console.error(`Tried: ${resolved.tried.join(", ")}`);
}
