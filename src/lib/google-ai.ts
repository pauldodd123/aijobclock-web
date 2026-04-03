import { GoogleGenerativeAI } from "@google/generative-ai";

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_client) {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_AI_API_KEY environment variable is not set");
    }
    _client = new GoogleGenerativeAI(apiKey);
  }
  return _client;
}

export function getGeminiModel(modelName = "gemini-1.5-pro") {
  return getClient().getGenerativeModel({ model: modelName });
}

export async function generateText(
  prompt: string,
  modelName = "gemini-1.5-pro",
): Promise<string> {
  const model = getGeminiModel(modelName);
  const result = await model.generateContent(prompt);
  return result.response.text();
}
