import crypto from "node:crypto";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

export interface TTSRequestOptions {
  text: string;
  voice?: string;
  rate?: number; // 0.5 ~ 2.0 (1.0 default)
  pitch?: number; // 0.5 ~ 1.5 (1.0 default)
  engine?: "edge-tts" | "custom";
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
