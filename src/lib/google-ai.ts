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

const IMAGE_TIMEOUT_MS = 45_000;

/**
 * Generate an image using Gemini's image generation model.
 * Returns a base64 data URL (e.g. "data:image/png;base64,...") or null on failure.
 * Tries the primary model first (3 attempts, 45s timeout each), then falls back to
 * the secondary model (3 attempts, 45s timeout each).
 */
export async function generateImage(prompt: string): Promise<string | null> {
  const models = [
    "gemini-3.1-flash-image-preview",
    "gemini-2.5-flash-image",
  ];

  for (const modelName of models) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const model = getClient().getGenerativeModel({ model: modelName });
        const timeoutSignal = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
        const generatePromise = model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          generationConfig: { responseModalities: ["image", "text"] } as any,
        });
        const result = await Promise.race([
          generatePromise,
          new Promise<never>((_, reject) =>
            timeoutSignal.addEventListener("abort", () =>
              reject(new Error(`generateImage timed out after ${IMAGE_TIMEOUT_MS}ms`))
            )
          ),
        ]);
        const parts = result.response.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = part as any;
          if (p.inlineData?.data) {
            console.log(`generateImage succeeded with model=${modelName} attempt=${attempt}`);
            return `data:${p.inlineData.mimeType ?? "image/png"};base64,${p.inlineData.data}`;
          }
        }
        console.warn(`generateImage: no image in response (model=${modelName}, attempt=${attempt})`);
      } catch (e) {
        console.error(`generateImage error (model=${modelName}, attempt=${attempt}):`, e);
      }
    }
    console.warn(`generateImage: all attempts failed for model=${modelName}, trying next model`);
  }
  console.error("generateImage: all models exhausted, returning null");
  return null;
}
