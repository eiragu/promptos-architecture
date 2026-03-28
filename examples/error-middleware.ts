/**
 * Example: API Error Handling Middleware
 *
 * Wraps route handlers with:
 * - Request tracing (unique ID per request)
 * - Error categorization (actionable error codes)
 * - Human-readable hints for debugging
 */

import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

type RouteHandler = (req: Request) => Promise<Response>;

/**
 * Wraps a route handler with error handling and tracing.
 *
 * Usage:
 *   export const POST = withRouteError(async (req) => {
 *     // Your handler code
 *     return NextResponse.json({ ok: true });
 *   });
 */
export function withRouteError(handler: RouteHandler): RouteHandler {
  return async (req) => {
    const traceId = req.headers.get("x-trace-id") || randomUUID();

    try {
      const res = await handler(req);
      res.headers.set("x-trace-id", traceId);
      return res;
    } catch (err: any) {
      const message = err?.message || String(err);

      // Categorize the error for actionable debugging
      const code = categorizeError(message);

      console.error(`[route-error] traceId=${traceId} code=${code}`, message);

      return NextResponse.json(
        {
          ok: false,
          requestId: traceId,
          error: {
            code,
            message,
            hint: getHint(code),
          },
        },
        { status: 500, headers: { "x-trace-id": traceId } }
      );
    }
  };
}

function categorizeError(message: string): string {
  if (/api key|unauthorized|401|403/i.test(message)) return "UPSTREAM_AUTH";
  if (/timeout|timed out|ETIMEDOUT/i.test(message)) return "UPSTREAM_TIMEOUT";
  if (/ECONNREFUSED|ENOTFOUND|network/i.test(message)) return "UPSTREAM_NETWORK";
  if (/json/i.test(message)) return "JSON_PARSE";
  return "INTERNAL";
}

function getHint(code: string): string {
  const hints: Record<string, string> = {
    UPSTREAM_AUTH: "Check model API Key / BaseURL / proxy auth",
    UPSTREAM_TIMEOUT: "Check network or increase timeout",
    UPSTREAM_NETWORK: "Check proxy, DNS, or upstream service availability",
    JSON_PARSE: "Check request body format (Content-Type: application/json)",
    INTERNAL: "Check server logs with the traceId for stack trace",
  };
  return hints[code] ?? "Unknown error — check server logs";
}
