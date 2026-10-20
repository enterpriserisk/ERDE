import { GoogleGenAI } from "@google/genai";

function createClient(): GoogleGenAI {
  // Outside Replit (e.g. on Vercel), call the Gemini API directly with a
  // Google AI Studio key.
  if (process.env.GEMINI_API_KEY) {
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  // On Replit, the Gemini AI integration provides a proxy URL and key.
  if (
    process.env.AI_INTEGRATIONS_GEMINI_BASE_URL &&
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY
  ) {
    return new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });
  }

  throw new Error(
    "GEMINI_API_KEY must be set. Create one at https://aistudio.google.com/apikey (or provision the Replit Gemini AI integration).",
  );
}

export const ai = createClient();
