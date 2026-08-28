import crypto from "node:crypto";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { Agent, ProxyAgent } from "undici";
import type { Dispatcher } from "undici";

export interface TTSRequestOptions {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  engine?: "edge-tts" | "fish-audio" | "custom";
  fishConfig?: {
    apiKey?: string;
    referenceId?: string;
    model?: string;
  };
  customConfig?: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
    voice?: string;
  };
}

// In-memory audio cache: MD5 key -> Buffer
const audioCache = new Map<string, { buffer: Buffer; expiresAt: number }>();
const MAX_CACHE_ITEMS = 300;

function createFishDispatcher(): Dispatcher {
  const proxyUrl = process.env.FISH_AUDIO_PROXY?.trim()
    || process.env.HTTPS_PROXY?.trim()
    || process.env.HTTP_PROXY?.trim();
  if (proxyUrl) return new ProxyAgent(proxyUrl);
  return new Agent({ connect: { family: 4, timeout: 30_000 } });
}

const FISH_AUDIO_ORIGIN = "https://fishaudio.org";
const FISH_TEST_VOICE_ID = "00a1b221-6137-4b73-ad62-b0cbce134167";
const DEFAULT_FISH_MODEL = "fishaudio-s21pro-flash";
const fishDispatcher = createFishDispatcher();

function fishRequestInit(init: RequestInit): RequestInit & { dispatcher: Dispatcher } {
  return { ...init, dispatcher: fishDispatcher };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readFishError(status: number, body: string): string {
  let detail = body.slice(0, 250);
  try {
    const parsed = JSON.parse(body) as { message?: unknown; code?: unknown; requestId?: unknown };
    const parts = [parsed.message, parsed.code, parsed.requestId]
      .filter((item): item is string => typeof item === "string" && item.length > 0);
    if (parts.length > 0) detail = parts.join(" · ");
  } catch {
    // Fish Audio can return plain text for gateway errors.
  }
  if (status === 401) return `Fish Audio API Key 无效或已失效：${detail}`;
  if (status === 402) return `Fish Audio 额度不足：${detail}`;
  if (status === 429) return `Fish Audio 请求过于频繁，请稍后再试：${detail}`;
  return `Fish Audio 接口返回 ${status}：${detail}`;
}

function formatRate(rate: number): string {
  const percent = Math.round((rate - 1.0) * 100);
  return percent >= 0 ? `+${percent}%` : `${percent}%`;
}

function formatPitch(pitch: number): string {
  const percent = Math.round((pitch - 1.0) * 100);
  return percent >= 0 ? `+${percent}Hz` : `${percent}Hz`;
}

/**
 * Generate speech audio using Microsoft Edge Neural TTS
 */
export async function synthesizeEdgeTTS(
  text: string,
  voice = "zh-CN-XiaoyiNeural",
  rate = 1.0,
  pitch = 1.0,
): Promise<Buffer> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("朗读文本不能为空。");

  const cacheKey = crypto
    .createHash("md5")
    .update(`edge:${voice}:${rate.toFixed(2)}:${pitch.toFixed(2)}:${cleanText}`)
    .digest("hex");

  const cached = audioCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.buffer;
  }

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(cleanText, {
    rate: formatRate(rate),
    pitch: formatPitch(pitch),
  });

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      reject(new Error("Edge TTS 响应超时（15 秒）。"));
    }, 15000);

    audioStream.on("data", (data: Buffer) => {
      chunks.push(data);
    });

    audioStream.on("end", () => {
      clearTimeout(timer);
      const finalBuffer = Buffer.concat(chunks);
      if (finalBuffer.length === 0) {
        reject(new Error("Edge TTS 未能生成音频。"));
      } else {
        if (audioCache.size > MAX_CACHE_ITEMS) {
          const firstKey = audioCache.keys().next().value;
          if (firstKey) audioCache.delete(firstKey);
        }
        audioCache.set(cacheKey, {
          buffer: finalBuffer,
          expiresAt: Date.now() + 2 * 3600_000,
        });
        resolve(finalBuffer);
      }
    });

    audioStream.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Generate speech audio using Fish Audio HTTP TTS v3.
 */
export async function synthesizeFishAudioTTS(
  text: string,
  config: { apiKey?: string; referenceId?: string; model?: string },
  rate = 1.0,
): Promise<Buffer> {
  const apiKey = (config.apiKey || "").trim();
  if (!apiKey) throw new Error("Fish Audio 需要填写 API Key。请在设置中填入你在 fishaudio.org 获取的 API Key。");

  const cleanText = text.trim();
  if (!cleanText) throw new Error("朗读文本不能为空。");

  const referenceId = (config.referenceId || FISH_TEST_VOICE_ID).trim();
  const requestedModel = (config.model || DEFAULT_FISH_MODEL).trim();
  const model = requestedModel.startsWith("fishaudio-") ? requestedModel : DEFAULT_FISH_MODEL;
  const targetUrl = `${FISH_AUDIO_ORIGIN}/api/open/v3/speech/tts`;

  const cacheKey = crypto
    .createHash("md5")
    .update(`fish:${targetUrl}:${model}:${referenceId}:${rate.toFixed(2)}:${cleanText}`)
    .digest("hex");

  const cached = audioCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.buffer;
  }

  const requestBody = {
    text: cleanText,
    voiceId: referenceId,
    modelId: model,
    format: "mp3",
    speed: Math.max(0.5, Math.min(2, rate)),
    language: "zh",
    textNormalization: true,
  };

  let response: Response;
  try {
    response = await fetch(targetUrl, fishRequestInit({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45_000),
    }));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`无法连接 Fish Audio（${new URL(targetUrl).host}）：${reason}`);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(readFishError(response.status, errText));
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("audio/")) {
    const unexpected = await response.text().catch(() => "");
    throw new Error(`Fish Audio 返回的不是音频（${contentType || "未知类型"}）：${unexpected.slice(0, 200)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > 0) {
    if (audioCache.size > MAX_CACHE_ITEMS) {
      const firstKey = audioCache.keys().next().value;
      if (firstKey) audioCache.delete(firstKey);
    }
    audioCache.set(cacheKey, {
      buffer,
      expiresAt: Date.now() + 2 * 3600_000,
    });
  }

  if (buffer.length === 0) throw new Error("Fish Audio 返回了空音频。");
  return buffer;
}

/**
 * Fetch available voice models from Fish Audio API
 */
export async function listFishAudioModels(
  apiKey: string,
  query = "",
): Promise<Array<{ id: string; title: string; description: string; tags: string[]; modelIds: string[] }>> {
  const cleanKey = (apiKey || "").trim();
  if (!cleanKey) throw new Error("请先填写 Fish Audio API Key。");
  const targetUrl = `${FISH_AUDIO_ORIGIN}/api/open/v3/voices?page=1&pageSize=100&includePersonal=true`;

  let response: Response;
  try {
    response = await fetch(targetUrl, fishRequestInit({
      headers: { Authorization: `Bearer ${cleanKey}` },
      signal: AbortSignal.timeout(20_000),
    }));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`无法连接 Fish Audio（${new URL(targetUrl).host}）：${reason}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(readFishError(response.status, text));
  }

  const json: unknown = await response.json();
  const rawItems = Array.isArray(json)
    ? json
    : isRecord(json) && Array.isArray(json.items)
      ? json.items
      : isRecord(json) && Array.isArray(json.data)
        ? json.data
        : isRecord(json) && Array.isArray(json.models)
          ? json.models
          : [];

  const normalizedQuery = query.trim().toLocaleLowerCase();
  return rawItems.flatMap((item) => {
    if (!isRecord(item)) return [];
    const voice = {
      id: readString(item.voiceId) || readString(item._id) || readString(item.id),
      title: readString(item.title) || readString(item.name) || readString(item.voice_name) || "未命名音色",
      description: readString(item.description) || readString(item.reference_text) || readString(item.primaryLanguage),
      tags: readStringArray(item.tags).length > 0 ? readStringArray(item.tags) : readStringArray(item.languages),
      modelIds: readStringArray(item.modelIds),
    };
    return voice.id ? [voice] : [];
  }).filter((voice) => {
    if (!normalizedQuery) return true;
    return `${voice.title} ${voice.description} ${voice.tags.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery);
  });
}

/**
 * Generate speech audio using an OpenAI-compatible TTS endpoint (/v1/audio/speech)
 */
export async function synthesizeCustomTTS(
  text: string,
  config: { baseURL?: string; apiKey?: string; model?: string; voice?: string },
  rate = 1.0,
): Promise<Buffer> {
  const baseURL = (config.baseURL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = `${baseURL}/audio/speech`;
  const apiKey = config.apiKey || "";
  const model = config.model || "tts-1";
  const voice = config.voice || "alloy";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      speed: Math.max(0.25, Math.min(4.0, rate)),
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(20000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`自定义 TTS 接口返回 ${response.status}: ${errText.slice(0, 200)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
