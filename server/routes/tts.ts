import { Router } from "express";
import {
  listFishAudioModels,
  synthesizeCustomTTS,
  synthesizeEdgeTTS,
  synthesizeFishAudioTTS,
} from "../tts.js";

interface TtsRequestBody {
  text?: unknown;
  voice?: unknown;
  rate?: unknown;
  pitch?: unknown;
  engine?: unknown;
  customConfig?: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
    voice?: string;
  };
  fishConfig?: {
    apiKey?: string;
    referenceId?: string;
    model?: string;
  };
}

function boundedNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

export function createTtsRouter() {
  const router = Router();

  router.post("/fish/models", async (req, res) => {
    const { apiKey, query } = (req.body ?? {}) as { apiKey?: unknown; query?: unknown };
    try {
      const models = await listFishAudioModels(String(apiKey || ""), String(query || ""));
      res.json({ models });
    } catch (error) {
      const message = error instanceof Error ? error.message : "获取 Fish Audio 音色列表失败。";
      console.error("[ai-companion] Fish Audio 模型列表失败：", message);
      res.status(502).json({ error: message });
    }
  });

  router.post("/tts", async (req, res) => {
    const body = (req.body ?? {}) as TtsRequestBody;
    const speechText = String(body.text || "").trim().slice(0, 1000);
    if (!speechText) {
      res.status(400).json({ error: "朗读文本不能为空。" });
      return;
    }

    const speechRate = boundedNumber(body.rate, 0.5, 2, 1);
    const speechPitch = boundedNumber(body.pitch, 0.5, 1.5, 1);

    try {
      let audioBuffer: Buffer;
      if (body.engine === "fish-audio") {
        audioBuffer = await synthesizeFishAudioTTS(speechText, body.fishConfig || {}, speechRate);
      } else if (body.engine === "custom" && body.customConfig?.baseURL) {
        audioBuffer = await synthesizeCustomTTS(speechText, body.customConfig, speechRate);
      } else {
        audioBuffer = await synthesizeEdgeTTS(
          speechText,
          typeof body.voice === "string" && body.voice ? body.voice : "zh-CN-XiaoyiNeural",
          speechRate,
          speechPitch,
        );
      }

      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", audioBuffer.length);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(audioBuffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "语音合成失败。";
      console.error("[ai-companion] TTS 失败：", message);
      res.status(502).json({ error: message });
    }
  });

  return router;
}
