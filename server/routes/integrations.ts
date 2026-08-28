import { Router } from "express";
import { fetchErrorMessage, normalizeBaseURL } from "../provider.js";
import { runVisionComment, type VisionCommentBody } from "../vision.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readModelIds(value: unknown): string[] {
  if (!isRecord(value)) return [];
  const candidates = Array.isArray(value.data)
    ? value.data
    : Array.isArray(value.models)
      ? value.models
      : [];
  return candidates
    .map((item) => typeof item === "string" ? item : isRecord(item) ? item.id : null)
    .filter((item): item is string => typeof item === "string" && item.length > 0)
    .sort();
}

export function createIntegrationsRouter() {
  const router = Router();

  router.post("/models", async (req, res) => {
    const { baseURL, apiKey } = (req.body ?? {}) as { baseURL?: string; apiKey?: string };
    if (!baseURL || !apiKey) {
      res.status(400).json({ error: "需要填写 接口地址 和 API Key。" });
      return;
    }

    let url = "";
    try {
      const base = normalizeBaseURL(baseURL);
      url = `${base}/models`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        res.status(502).json({ error: `供应商返回 ${response.status}：${body.slice(0, 200)}` });
        return;
      }
      res.json({ models: readModelIds(await response.json()) });
    } catch (error) {
      const message = error instanceof TypeError || (error instanceof Error && error.name === "TimeoutError")
        ? fetchErrorMessage(error, url || baseURL)
        : error instanceof Error ? error.message : String(error);
      console.error("[ai-companion] 获取模型失败：", message);
      res.status(502).json({ error: message });
    }
  });

  router.post("/vision/comment", async (req, res) => {
    try {
      const result = await runVisionComment(req.body as VisionCommentBody);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "视觉分析失败。";
      console.error("[ai-companion] 视觉分析失败：", message);
      res.status(502).json({ error: message });
    }
  });

  return router;
}
