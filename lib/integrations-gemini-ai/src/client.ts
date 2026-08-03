import { GoogleGenAI } from "@google/genai";

function requireGeminiEnv(): { apiKey: string; baseUrl: string } {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const baseUrl =
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ??
    "https://generativelanguage.googleapis.com";

  if (!apiKey) {
    throw new Error(
      "AI_INTEGRATIONS_GEMINI_API_KEY is missing. Add it to .env (see .env.example / START.md).",
    );
  }

  return { apiKey, baseUrl };
}

let _ai: GoogleGenAI | null = null;

function getAi(): GoogleGenAI {
  if (!_ai) {
    const { apiKey, baseUrl } = requireGeminiEnv();
    _ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: "",
        baseUrl,
      },
    });
  }
  return _ai;
}

/** Lazy client — API can boot without a key; Jessica/Gemini routes fail clearly on use. */
export const ai: GoogleGenAI = new Proxy({} as GoogleGenAI, {
  get(_target, prop, receiver) {
    const client = getAi() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
