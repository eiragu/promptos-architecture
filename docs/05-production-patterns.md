# Production Patterns

Real-world patterns used in the Promptos system for reliability, security, and observability.

## 1. Feature Flags

### Problem
Deploying a new engine version (V2) alongside the old one without risk.

### Solution

```typescript
function envOn(name: string): boolean {
  const v = String(process.env[name] ?? "").toLowerCase().trim();
  return ["1", "true", "on", "yes"].includes(v);
}

// In the engine
export async function runPromptModule(key, input, engine) {
  if (envOn("ENGINE_PROVIDER_V2")) {
    return runPromptModuleV2(key, input, engine);  // New path
  }
  return runPromptModuleLegacy(key, input, engine); // Safe default
}
```

### Why accept multiple values?

Different systems use different conventions:
- Docker Compose: `ENGINE_PROVIDER_V2=true`
- Shell: `ENGINE_PROVIDER_V2=1`
- Vercel: `ENGINE_PROVIDER_V2=on`

Accepting all of them prevents "why isn't my flag working?" debugging sessions.

---

## 2. Bootstrap Validation

### Problem
Config errors (missing prompts, broken mappings) only surface when a user makes a request.

### Solution
Validate on first request, cache the result:

```typescript
let bootstrapped = false;

export async function bootstrapCore() {
  if (bootstrapped) return;  // Only run once
  bootstrapped = true;

  const result = validateCorePromptMap();
  if (!result.ok) {
    throw new Error(`Core bootstrap failed:\n${formatIssues(result.issues)}`);
  }
}
```

### Validation Checks
1. `CORE_ENGINE_NAME` is a valid object
2. `PROMPT_BANK` is loaded and non-empty
3. All core definitions have corresponding prompt keys

### Trade-off: Fail-Fast vs. Graceful Degradation

We chose **fail-fast** — if core config is broken, the API returns 500 immediately rather than returning incorrect results. This is the right choice for a prompt system where incorrect output is worse than no output.

---

## 3. Error Categorization

### Problem
"Something went wrong" is useless for debugging. Need actionable error messages.

### Solution

```typescript
const code =
  /api key|unauthorized|401|403/i.test(msg) ? "UPSTREAM_AUTH" :
  /timeout|timed out|ETIMEDOUT/i.test(msg)  ? "UPSTREAM_TIMEOUT" :
  /ECONNREFUSED|ENOTFOUND|network/i.test(msg) ? "UPSTREAM_NETWORK" :
  /json/i.test(msg) ? "JSON_PARSE" :
  "INTERNAL";
```

Each error code has a **human-readable hint**:

| Code | Hint |
|------|------|
| `UPSTREAM_AUTH` | Check model API Key / BaseURL |
| `UPSTREAM_TIMEOUT` | Check network or increase timeout |
| `UPSTREAM_NETWORK` | Check proxy, DNS, or upstream service |
| `JSON_PARSE` | Check request body format |
| `INTERNAL` | Check server logs with traceId |

---

## 4. Request Tracing

### Problem
Finding the root cause of a failure across multiple layers.

### Solution
Generate a `requestId` at the entry point, propagate it through all layers:

```typescript
// API entry
const traceId = req.headers.get("x-trace-id") || randomUUID();

// Response always includes traceId
res.headers.set("x-trace-id", traceId);

// Logs include traceId
console.error(`[route-error] traceId=${traceId} code=${code}`, message);
```

### Usage
```bash
# Client gets traceId in response header
x-trace-id: 550e8400-e29b-41d4-a716-446655440000

# Support can search logs by traceId
grep "550e8400" /var/log/app.log
```

---

## 5. Timing-Safe Authentication

### Problem
API key comparison vulnerable to timing attacks.

### Solution

```typescript
import { timingSafeEqual } from "crypto";

export function verifyApiKey(authHeader: string | null): boolean {
  const expected = process.env.PROMPTOS_API_KEY;
  if (!expected) return false;  // Fail-closed

  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;

  if (!token) return false;

  const a = Buffer.from(token, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

Key decisions:
- **Fail-closed**: No API key configured = reject all (not accept all)
- **Constant-time comparison**: Prevents attackers from guessing key length
- **Bearer format support**: Standard HTTP auth header format

---

## 6. Response Backward Compatibility

### Problem
Multiple frontend versions expect different response field names.

### Solution
Return all aliases:

```typescript
return {
  ok: true,
  output: text,       // v1 frontend
  text: text,         // v2 frontend
  content: text,      // v3 frontend
  modelOutput: text,  // internal tools
  meta: { ... }
};
```

Cost: Nearly zero (string references, not copies).
Benefit: Zero frontend breakage during backend refactors.

---

## 7. Graceful Engine Switching

### Problem
Need to switch between legacy and V2 engine without downtime.

### Solution
Same function signature, internal routing:

```typescript
export async function runPromptModule(key, input, engine) {
  // Same interface, different implementation
  if (envOn("ENGINE_PROVIDER_V2")) {
    return runPromptModuleV2(key, input, engine);
  }
  return runPromptModuleLegacy(key, input, engine);
}
```

External callers never change. The switch is a single environment variable.
