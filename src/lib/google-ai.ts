import { GoogleGenerativeAI } from "@google/generative-ai";

let _client: GoogleGenerativeAI | null = null;

export function getClient(): GoogleGenerativeAI {
  if (!_client) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY environment variable is not set");
    }
    _client = new GoogleGenerativeAI(apiKey);
  }
  return _client;
}

export function getGeminiModel(modelName = "gemini-2.5-flash") {
  return getClient().getGenerativeModel({ model: modelName });
}

export async function generateText(
  prompt: string,
  modelName = "gemini-2.5-flash",
): Promise<string> {
  const model = getGeminiModel(modelName);
  const result = await model.generateContent(prompt);
  return result.response.text();
}

/**
 * Generate an image using Gemini's image generation model.
 * Returns a base64 data URL (e.g. "data:image/png;base64,...") or null on failure.
 */
export async function generateImage(prompt: string): Promise<string | null> {
  const models = [
    "gemini-3-pro-image-preview",
  ];

  for (const modelName of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const model = getClient().getGenerativeModel({ model: modelName });
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          generationConfig: { responseModalities: ["image", "text"] } as any,
        });
        const parts = result.response.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = part as any;
          if (p.inlineData?.data) {
            return `data:${p.inlineData.mimeType ?? "image/png"};base64,${p.inlineData.data}`;
          }
        }
      } catch (e) {
        console.error(`generateImage error (${modelName}, attempt ${attempt}):`, e);
      }
    }
  }
  return null;
}
