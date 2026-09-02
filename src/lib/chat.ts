import { apiUrl } from "./api";

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

export interface ProviderCfg {
  mode: "default" | "custom";
  baseURL?: string;
  apiKey?: string;
  model?: string;
  visionProvider?: {
    enabled: boolean;
    baseURL?: string;
    apiKey?: string;
    model?: string;
  };
}

import type { MemoryKind } from "@/data/persona";
import type { TopicFlow } from "@/lib/topicFlow";

export interface ChatContext {
  affinity: number;
  mood: number;
  earlierDigest: string;
  personality: { gentle: number; clingy: number; tsundere: number; possessive: number };
  replyStyle: "daily" | "immersive" | "story";
  hour: number;
  profile: { name: string; age: number; birthday: string; userNickname: string; city: string };
  weather: { location: string; temperature: number; apparentTemperature: number; weatherCode: number; label: string; isDay: boolean; updatedAt: number } | null;
  adultMode: boolean;
  memories: Array<{ id: string; text: string; kind: MemoryKind; ts: number }>;
  lorebookContext?: string;
  interactionMode?: "user_led" | "proactive";
  topicFlow?: TopicFlow;
}

export interface MemoryAnalysisResult {
  available: boolean;
  summary?: string;
  memories?: Array<{ text: string; kind: MemoryKind }>;
  agreements?: Array<{ text: string; dueDate: string | null }>;
  error?: string;
}

export interface DiaryAnalysisResult {
  available: boolean;
  title?: string;
  content?: string;
  emotion?: string;
  carryover?: string;
  error?: string;
}

interface StreamHandlers {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export async function streamChat(
  params: { context: ChatContext; messages: ChatMsg[]; provider: ProviderCfg },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const resp = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal,
    });
    if (!resp.ok || !resp.body) {
      handlers.onError(`请求失败：HTTP ${resp.status}`);
      return;
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "delta") handlers.onDelta(evt.text as string);
          else if (evt.type === "done") handlers.onDone();
          else if (evt.type === "error") handlers.onError(evt.message as string);
        } catch {
          // ignore
        }
      }
    }
    handlers.onDone();
  } catch (err) {
    if ((err as Error).name === "AbortError") return;
    handlers.onError(err instanceof Error ? err.message : String(err));
  }
}

export async function analyzeMemory(params: {
  previousSummary: string;
  messages: ChatMsg[];
  provider: ProviderCfg;
  today: string;
}): Promise<MemoryAnalysisResult> {
  const response = await fetch(apiUrl("/api/memory-analysis"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const payload = await response.json().catch(() => ({})) as MemoryAnalysisResult;
  if (!response.ok) throw new Error(payload.error || `整理记忆失败：HTTP ${response.status}`);
  return payload;
}

export async function analyzeDiary(params: {
  date: string;
  profile: { name: string; userNickname: string };
  messages: ChatMsg[];
  experiences: Array<{ title: string; detail: string; kind: string }>;
  agreements: Array<{ text: string; status: string; dueDate: string | null }>;
  provider: ProviderCfg;
}): Promise<DiaryAnalysisResult> {
  const response = await fetch(apiUrl("/api/diary-analysis"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const payload = await response.json().catch(() => ({})) as DiaryAnalysisResult;
  if (!response.ok) throw new Error(payload.error || `生成日记失败：HTTP ${response.status}`);
  return payload;
}
