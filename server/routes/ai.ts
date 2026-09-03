import express, { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildSystemPrompt,
  DEFAULT_PERSONALITY,
  DEFAULT_PROFILE,
  type CompanionMemory,
  type CompanionProfile,
  type MemoryKind,
  type PersonalityTraits,
  type ReplyStyle,
  type WeatherInfo,
} from "../../src/data/persona.js";
import { StreamingReasoningFilter } from "../../src/lib/reasoningFilter.js";
import type { TopicFlow } from "../../src/lib/topicFlow.js";
import type { VisualNovelScene } from "../../src/lib/visualNovelScene.js";
import { fetchErrorMessage, normalizeBaseURL } from "../provider.js";

const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "claude-opus-4-7";

type Role = "user" | "assistant";
interface ChatMsg {
  role: Role;
  content: string;
}
interface ProviderCfg {
  mode: "default" | "custom";
  baseURL?: string;
  apiKey?: string;
  model?: string;
}
interface ChatBody {
  context?: {
    affinity?: number; mood?: number; earlierDigest?: string; personality?: PersonalityTraits;
    replyStyle?: ReplyStyle; hour?: number; profile?: CompanionProfile; weather?: WeatherInfo | null;
    adultMode?: boolean; memories?: CompanionMemory[]; lorebookContext?: string;
    interactionMode?: "user_led" | "proactive";
    topicFlow?: TopicFlow;
    visualNovelScene?: VisualNovelScene | null;
  };
  messages: ChatMsg[];
  provider: ProviderCfg;
}
interface MemoryAnalysisBody {
  previousSummary?: string;
  messages?: ChatMsg[];
  provider?: ProviderCfg;
  today?: string;
}
interface MemoryAnalysisResult {
  summary: string;
  memories: Array<{ text: string; kind: MemoryKind }>;
  agreements: Array<{ text: string; dueDate: string | null }>;
}
interface DiaryAnalysisBody {
  date?: string;
  profile?: { name?: string; userNickname?: string };
  messages?: ChatMsg[];
  experiences?: Array<{ title?: string; detail?: string; kind?: string }>;
  agreements?: Array<{ text?: string; status?: string; dueDate?: string | null }>;
  provider?: ProviderCfg;
}
interface DiaryAnalysisResult { title: string; content: string; emotion: string; carryover: string }

function parseMemoryAnalysis(raw: string): MemoryAnalysisResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value = JSON.parse(cleaned) as Partial<MemoryAnalysisResult>;
  const kinds = new Set(["name", "preference", "habit", "important"]);
  const summary = typeof value.summary === "string" ? value.summary.trim().slice(0, 900) : "";
  const memories = Array.isArray(value.memories) ? value.memories.flatMap((item) => {
    if (!item || typeof item.text !== "string" || !kinds.has(item.kind || "")) return [];
    const text = item.text.trim().slice(0, 100);
    return text ? [{ text, kind: item.kind as MemoryAnalysisResult["memories"][number]["kind"] }] : [];
  }).slice(0, 8) : [];
  const agreements = Array.isArray(value.agreements) ? value.agreements.flatMap((item) => {
    if (!item || typeof item.text !== "string") return [];
    const text = item.text.trim().slice(0, 80);
    const dueDate = typeof item.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate) ? item.dueDate : null;
    return text ? [{ text, dueDate }] : [];
  }).slice(0, 6) : [];
  return { summary, memories, agreements };
}

function memoryAnalysisPrompt(today: string): string {
  return `你是陪伴应用的记忆整理器。今天是 ${today}。只返回一个 JSON 对象，不要 Markdown，不要解释。
任务：根据“已有摘要”和“新对话”，压缩出可长期保留的关系摘要，并提取明确、可核实的用户信息与双方约定。
严禁编造、猜测、补全未说出的事实；不记录敏感个人信息、露骨内容或任何未成年相关内容。普通闲聊、一次性情绪、角色扮演台词不要记录。
约定必须是双方明确说好、提醒、答应或计划一起做的事；不要把可可单方面的建议当约定。日期仅在文本明确且可由今天推算时填 YYYY-MM-DD，否则为 null。
JSON 格式：{"summary":"不超过350字的中文摘要","memories":[{"text":"第三人称简短事实","kind":"name|preference|habit|important"}],"agreements":[{"text":"简短约定","dueDate":"YYYY-MM-DD 或 null"}]}`;
}

async function runMemoryAnalysis(body: MemoryAnalysisBody): Promise<MemoryAnalysisResult | null> {
  const provider = body.provider || { mode: "default" as const };
  const messages = Array.isArray(body.messages) ? body.messages.slice(-24).flatMap((item) => {
    if (!item || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") return [];
    const content = item.content.trim().slice(0, 500);
    return content ? [{ role: item.role, content }] : [];
  }) : [];
  if (!messages.length) return { summary: String(body.previousSummary || "").slice(0, 900), memories: [], agreements: [] };
  const userContent = JSON.stringify({
    previousSummary: String(body.previousSummary || "").slice(0, 900),
    newMessages: messages,
  });
  const system = memoryAnalysisPrompt(/^\d{4}-\d{2}-\d{2}$/.test(String(body.today)) ? String(body.today) : new Date().toISOString().slice(0, 10));
  let raw = "";
  if (provider.mode === "custom") {
    if (!provider.baseURL || !provider.apiKey || !provider.model) throw new Error("自定义供应商需要填写接口地址、API Key 和模型名。");
    const url = `${normalizeBaseURL(provider.baseURL)}/chat/completions`;
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` }, body: JSON.stringify({ model: provider.model, stream: false, messages: [{ role: "system", content: system }, { role: "user", content: userContent }] }), signal: AbortSignal.timeout(30_000) });
    } catch (error) { throw new Error(fetchErrorMessage(error, url)); }
    if (!response.ok) throw new Error(`供应商返回 ${response.status}：${(await response.text()).slice(0, 300)}`);
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    raw = String(json.choices?.[0]?.message?.content || "");
  } else {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({ model: DEFAULT_MODEL, max_tokens: 1000, system, messages: [{ role: "user", content: userContent }] });
    raw = response.content.filter((item) => item.type === "text").map((item) => item.text).join("");
  }
  return parseMemoryAnalysis(raw);
}

function parseDiaryAnalysis(raw: string, date: string): DiaryAnalysisResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const value = JSON.parse(cleaned) as Partial<DiaryAnalysisResult>;
  return {
    title: String(value.title || `${date} · 今天的日记`).trim().slice(0, 50),
    content: String(value.content || "").trim().slice(0, 1200),
    emotion: String(value.emotion || "平静").trim().slice(0, 30),
    carryover: String(value.carryover || "").trim().slice(0, 160),
  };
}

async function runDiaryAnalysis(body: DiaryAnalysisBody): Promise<DiaryAnalysisResult | null> {
  const provider = body.provider || { mode: "default" as const };
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date)) ? String(body.date) : new Date().toISOString().slice(0, 10);
  const name = String(body.profile?.name || "可可").slice(0, 12);
  const userNickname = String(body.profile?.userNickname || "哥哥").slice(0, 12);
  const input = {
    date,
    messages: Array.isArray(body.messages) ? body.messages.slice(-30).map((item) => ({ role: item.role, content: String(item.content || "").slice(0, 500) })) : [],
    experiences: Array.isArray(body.experiences) ? body.experiences.slice(-12).map((item) => ({ title: String(item.title || "").slice(0, 60), detail: String(item.detail || "").slice(0, 160), kind: item.kind })) : [],
    agreements: Array.isArray(body.agreements) ? body.agreements.slice(-12).map((item) => ({ text: String(item.text || "").slice(0, 80), status: item.status, dueDate: item.dueDate })) : [],
  };
  if (!input.messages.some((item) => item.role === "user" && item.content.trim())) return null;
  const system = `你是陪伴应用中${name}的日记整理器。只返回 JSON，不要 Markdown。
只能使用输入中真实出现的聊天、共同经历和约定，严禁虚构用户做过的事。用${name}第一人称写中文短日记，称呼用户为“${userNickname}”。不要逐字复制敏感聊天，不写露骨内容。
content 控制在 120～260 字，概括当天话题、双方情绪、关系变化及一个克制的小感受。emotion 用不超过10字概括当天情绪。carryover 是下一次聊天可自然延续的一条简短情绪或未完话题；没有则为空字符串。
格式：{"title":"日期与简短标题","content":"日记正文","emotion":"情绪","carryover":"下次聊天延续提示"}`;
  const userContent = JSON.stringify(input);
  let raw = "";
  if (provider.mode === "custom") {
    if (!provider.baseURL || !provider.apiKey || !provider.model) throw new Error("自定义供应商需要填写接口地址、API Key 和模型名。");
    const url = `${normalizeBaseURL(provider.baseURL)}/chat/completions`;
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` }, body: JSON.stringify({ model: provider.model, stream: false, messages: [{ role: "system", content: system }, { role: "user", content: userContent }] }), signal: AbortSignal.timeout(30_000) });
    } catch (error) { throw new Error(fetchErrorMessage(error, url)); }
    if (!response.ok) throw new Error(`供应商返回 ${response.status}：${(await response.text()).slice(0, 300)}`);
    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    raw = String(json.choices?.[0]?.message?.content || "");
  } else {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({ model: DEFAULT_MODEL, max_tokens: 900, system, messages: [{ role: "user", content: userContent }] });
    raw = response.content.filter((item) => item.type === "text").map((item) => item.text).join("");
  }
  return parseDiaryAnalysis(raw, date);
}

function sseInit(res: express.Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}
function sseSend(res: express.Response, obj: unknown) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}


export function createAiRouter() {
  const router = Router();

  router.post("/api/memory-analysis", async (req, res) => {
    try {
      const result = await runMemoryAnalysis(req.body as MemoryAnalysisBody);
      if (!result) {
        res.json({ available: false, error: "当前没有可用于整理记忆的模型。" });
        return;
      }
      res.json({ available: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "整理记忆时发生未知错误。";
      console.error("[ai-companion] 整理记忆失败：", message);
      res.status(502).json({ error: message });
    }
  });
  
  router.post("/api/diary-analysis", async (req, res) => {
    try {
      const result = await runDiaryAnalysis(req.body as DiaryAnalysisBody);
      if (!result) { res.json({ available: false, error: "当前没有可用于生成日记的模型或当天没有真实聊天。" }); return; }
      res.json({ available: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : "生成日记时发生未知错误。";
      console.error("[ai-companion] 生成日记失败：", message);
      res.status(502).json({ error: message });
    }
  });
  
  router.post("/api/chat", async (req, res) => {
    const body = req.body as ChatBody;
    const context = body.context || {};
    const profile = context.profile && Number(context.profile.age) >= 1
      ? { ...DEFAULT_PROFILE, ...context.profile, name: String(context.profile.name || "可可").slice(0, 12), age: Math.min(99, Math.max(1, Number(context.profile.age))) }
      : DEFAULT_PROFILE;
    const system = buildSystemPrompt(
      Math.min(100, Math.max(0, Number(context.affinity) || 0)),
      Math.min(100, Math.max(0, Number(context.mood) || 50)),
      String(context.earlierDigest || "").slice(0, 1000),
      context.personality || DEFAULT_PERSONALITY,
      context.replyStyle || "immersive",
      Math.min(23, Math.max(0, Number(context.hour) || new Date().getHours())),
      profile,
      context.weather || null,
      context.adultMode === true,
      Array.isArray(context.memories) ? context.memories.slice(-50).map((item) => ({ ...item, text: String(item.text).slice(0, 100) })) : [],
      String(context.lorebookContext || "").slice(0, 3000),
      context.interactionMode === "proactive" ? "proactive" : "user_led",
      ["new", "continue", "switch", "proactive"].includes(String(context.topicFlow))
        ? context.topicFlow as TopicFlow
        : "new",
      typeof context.visualNovelScene?.summary === "string"
        ? context.visualNovelScene.summary.slice(0, 180)
        : "",
    );
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const provider = body.provider || { mode: "default" };
  
    sseInit(res);
    let closed = false;
    res.on("close", () => {
      closed = true;
    });
  
    try {
      if (provider.mode === "custom") {
        await streamOpenAICompatible(res, system, messages, provider, () => closed);
      } else if (process.env.ANTHROPIC_API_KEY) {
        await streamAnthropic(res, system, messages, () => closed);
      } else {
        await streamEcho(res, messages, () => closed);
      }
      if (!closed) sseSend(res, { type: "done" });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!closed) sseSend(res, { type: "error", message });
    } finally {
      if (!closed) res.end();
    }
  });
  

  return router;
}

async function streamAnthropic(
  res: express.Response,
  system: string,
  messages: ChatMsg[],
  isClosed: () => boolean,
) {
  const reasoningFilter = new StreamingReasoningFilter();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    thinking: { type: "enabled", budget_tokens: 1024 },
    system: [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  stream.on("text", (delta: string) => {
    const visible = reasoningFilter.push(delta);
    if (!isClosed() && visible) sseSend(res, { type: "delta", text: visible });
  });
  await stream.finalMessage();
  const tail = reasoningFilter.flush();
  if (!isClosed() && tail) sseSend(res, { type: "delta", text: tail });
}

async function streamOpenAICompatible(
  res: express.Response,
  system: string,
  messages: ChatMsg[],
  provider: ProviderCfg,
  isClosed: () => boolean,
) {
  if (!provider.baseURL || !provider.apiKey || !provider.model) {
    throw new Error("自定义供应商需要填写 接口地址、API Key 和 模型名。");
  }
  const base = normalizeBaseURL(provider.baseURL);
  const url = `${base}/chat/completions`;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: provider.model,
        stream: true,
        temperature: 0.7,
        presence_penalty: 0,
        frequency_penalty: 0.1,
        messages: [
          { role: "system", content: system },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });
  } catch (error) {
    throw new Error(fetchErrorMessage(error, url));
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    throw new Error(`供应商返回 ${upstream.status}：${text.slice(0, 300)}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const reasoningFilter = new StreamingReasoningFilter();

  while (true) {
    if (isClosed()) break;
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        const tail = reasoningFilter.flush();
        if (tail) sseSend(res, { type: "delta", text: tail });
        return;
      }
      try {
        const json = JSON.parse(payload);
        const delta: string | undefined = json?.choices?.[0]?.delta?.content;
        const visible = delta ? reasoningFilter.push(delta) : "";
        if (visible) sseSend(res, { type: "delta", text: visible });
      } catch {
        // ignore keep-alive / partial lines
      }
    }
  }
  const tail = reasoningFilter.flush();
  if (!isClosed() && tail) sseSend(res, { type: "delta", text: tail });
}

async function streamEcho(
  res: express.Response,
  messages: ChatMsg[],
  isClosed: () => boolean,
) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const userText = last?.content?.trim() || "";
  const replies = [
    `我在听呢~ 你刚刚说「${userText.slice(0, 20)}」，`,
    "虽然现在还没接上真正的大脑（没配置 API Key），",
    "但哥哥你随时都可以跟我聊天呀。等你在设置里填好 Key，",
    "我就能真的陪你唠嗑啦，先抱抱你~ (๑•̀ㅂ•́)و",
  ];
  const text = replies.join("");
  for (const ch of text) {
    if (isClosed()) return;
    sseSend(res, { type: "delta", text: ch });
    await new Promise((r) => setTimeout(r, 18));
  }
}
