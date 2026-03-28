/**
 * Example: LLM Provider Abstraction
 *
 * This shows the pattern used to support multiple LLM providers
 * behind a single unified interface.
 */

export type EngineType = "deepseek" | "gemini";

export type RunLLMInput = {
  engineType: EngineType;
  prompt: string;
  temperature?: number;
};

export type RunLLMOutput =
  | { ok: true; engineType: EngineType; text: string }
  | { ok: false; engineType: EngineType; error: string };

/**
 * Unified LLM caller — all providers go through this single function.
 *
 * To add a new provider:
 * 1. Add to EngineType union
 * 2. Add a new `if` branch below
 * 3. Set API key in environment
 */
export async function runLLM(input: RunLLMInput): Promise<RunLLMOutput> {
  const engineType = (input.engineType || "deepseek").toLowerCase() as EngineType;
  const prompt = input.prompt ?? "";
  const temperature = input.temperature ?? 0.7;

  // --- DeepSeek (OpenAI-compatible) ---
  if (engineType === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return { ok: false, engineType, error: "Missing DEEPSEEK_API_KEY" };

    try {
      // Using OpenAI SDK with custom baseURL — works for any OpenAI-compatible provider
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey, baseURL: "https://api.deepseek.com" });

      const completion = await client.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "You are a professional AI assistant." },
          { role: "user", content: prompt },
        ],
        temperature,
      });

      const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
      return { ok: true, engineType, text };
    } catch (e: any) {
      return { ok: false, engineType, error: `DeepSeek failed: ${e?.message}` };
    }
  }

  // --- Google Gemini ---
  if (engineType === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { ok: false, engineType, error: "Missing GEMINI_API_KEY" };

    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const result = await model.generateContent(prompt);
      const text = result?.response?.text?.() ?? "";
      return { ok: true, engineType, text };
    } catch (e: any) {
      return { ok: false, engineType, error: `Gemini failed: ${e?.message}` };
    }
  }

  return { ok: false, engineType, error: `Unsupported engine: ${engineType}` };
}
