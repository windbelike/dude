import * as dotenv from "dotenv";
import type { CreateMessageRequest, MessageResponse } from "../types/anthropic.js";

dotenv.config({ override: true });

if (process.env.ANTHROPIC_BASE_URL) {
  delete process.env.ANTHROPIC_AUTH_TOKEN;
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
const BASE_URL = process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
export const MODEL = process.env.MODEL_ID || "claude-sonnet-4-6";

export async function createMessage(req: CreateMessageRequest): Promise<MessageResponse> {
  if (!API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const response = await fetch(`${BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "unknown");
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  return (await response.json()) as MessageResponse;
}
