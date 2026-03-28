# LLM Provider Abstraction Layer

## Design Goal

Create a unified interface for calling any LLM provider, so the rest of the system doesn't need to know which model is being used.

## Interface Design

```typescript
export type EngineType = "deepseek" | "gemini";

export type RunLLMInput = {
  engineType: EngineType;
  prompt: string;
  temperature?: number;
};

export type RunLLMOutput =
  | { ok: true; engineType: EngineType; text: string }
  | { ok: false; engineType: EngineType; error: string };

export async function runLLM(input: RunLLMInput): Promise<RunLLMOutput>;
```

## Why Discriminated Union for Output?

We use `{ ok: true, ... } | { ok: false, ... }` instead of throwing exceptions because:

1. **Expected failures are not exceptions** — A missing API key is a config issue, not a crash
2. **Type narrowing** — TypeScript can narrow the type based on `ok`
3. **No try/catch boilerplate** — Callers use simple `if (!result.ok)` checks
4. **Composable** — Easy to chain, retry, or fallback

```typescript
const result = await runLLM(input);
if (!result.ok) {
  log.error(result.error);
  return fallback();
}
return result.text;
```

## Provider Implementation Pattern

Each provider follows the same pattern:

```
1. Check API key exists (fail-fast)
2. Create provider client
3. Call provider API
4. Normalize response to { ok, text }
5. Catch and normalize errors
```

### DeepSeek (via OpenAI SDK)

DeepSeek uses an OpenAI-compatible API, so we use the official OpenAI SDK with a custom `baseURL`:

```typescript
const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});
```

This pattern works for **any OpenAI-compatible provider** (Groq, Together, Ollama, etc.).

### Google Gemini

Gemini uses its own SDK but the abstraction normalizes it:

```typescript
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
const result = await model.generateContent(prompt);
const text = result?.response?.text?.() ?? "";
```

## Adding a New Provider

Adding a new provider requires changes in exactly **one file**:

```typescript
// provider.ts — add a new branch
if (engineType === "claude") {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) return { ok: false, engineType, error: "Missing CLAUDE_API_KEY" };

  // ... call Claude API
  return { ok: true, engineType, text };
}
```

Update the type:

```typescript
export type EngineType = "deepseek" | "gemini" | "claude";
```

That's it. No changes needed anywhere else in the system.

## Configuration

All provider configuration is through environment variables:

| Variable | Provider | Required |
|----------|----------|----------|
| `DEEPSEEK_API_KEY` | DeepSeek | Yes (if using DeepSeek) |
| `GEMINI_API_KEY` | Google Gemini | Yes (if using Gemini) |

## Design Trade-offs

| Choice | Pro | Con |
|--------|-----|-----|
| Single function (not class) | Simple, no instantiation | Less suitable for stateful providers |
| Env-based config | Simple, secure | No runtime provider switching |
| No streaming support | Simpler interface | Can't do real-time output |
| No retry logic | Caller controls retry | Need to add retry at caller level |

## Future Improvements

- [ ] Add streaming support (`runLLMStream`)
- [ ] Add automatic retry with exponential backoff
- [ ] Add provider health checking
- [ ] Add response caching layer
- [ ] Support runtime provider configuration (not just env vars)
