import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-ai/sdk";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { buildSystemPrompt, DEFAULT_PERSONALITY, DEFAULT_PROFILE, RANDOM_EVENTS, type CompanionMemory, type CompanionProfile, type PersonalityTraits, type ReplyStyle, type WeatherInfo } from "../src/data/persona.js";
import { createToken, db, hashPassword, initPlatform, requireAuth, SERVER_PRODUCTS, transaction, type AuthRequest, verifyPassword } from "./platform.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.PORT) || 8787;
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "claude-opus-4-7";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ALLOWED_PROVIDER_HOSTS = new Set(
  (process.env.ALLOWED_PROVIDER_HOSTS || "api.openai.com,api.deepseek.com,dashscope.aliyuncs.com")
    .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean),
);

const requestBuckets = new Map<string, { count: number; resetAt: number }>();
const weatherCache = new Map<string, { value: WeatherResponse; expiresAt: number }>();
app.use("/api", (req, res, next) => {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const bucket = requestBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) requestBuckets.set(key, { count: 1, resetAt: now + 60_000 });
  else if (bucket.count >= 60) {
    res.status(429).json({ error: "请求太频繁，请稍后再试。" });
    return;
  } else bucket.count += 1;
  next();
});

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
    adultMode?: boolean; memories?: CompanionMemory[];
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
  memories: Array<{ text: string; kind: "name" | "preference" | "habit" | "important" }>;
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
interface WeatherResponse {
  location: string;
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  label: string;
  isDay: boolean;
  updatedAt: number;
}

const weatherLabel = (code: number): string => {
  if (code === 0) return "晴";
  if (code <= 3) return "多云";
  if (code === 45 || code === 48) return "有雾";
  if (code >= 51 && code <= 57) return "毛毛雨";
  if (code >= 61 && code <= 67) return "下雨";
  if (code >= 71 && code <= 77) return "下雪";
  if (code >= 80 && code <= 82) return "阵雨";
  if (code >= 85 && code <= 86) return "阵雪";
  if (code >= 95) return "雷雨";
  return "天气变化中";
};

function normalizeBaseURL(input: string): string {
  const value = input.trim().replace(/\/+$/, "");
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("接口地址必须以 http:// 或 https:// 开头。");
  if (IS_PRODUCTION && url.protocol !== "https:") throw new Error("生产环境只允许 HTTPS 模型接口。");
  if (IS_PRODUCTION && !ALLOWED_PROVIDER_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`该供应商域名未获服务器允许：${url.hostname}`);
  }
  url.pathname = url.pathname.replace(/\/(models|chat\/completions)\/?$/, "").replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

function fetchErrorMessage(error: unknown, target: string): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const detail = cause?.code || cause?.message || error.message;
  if (error.name === "TimeoutError") return `连接供应商超时（10 秒）：${target}`;
  return `无法连接供应商：${detail}。请检查 Base URL、代理或本地服务是否已启动。目标：${target}`;
}

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

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    defaultProvider: process.env.ANTHROPIC_API_KEY ? "anthropic" : "echo",
    model: DEFAULT_MODEL,
  });
});

app.post("/api/auth/register", async (req, res) => {
  if (!db) { res.status(503).json({ error: "服务器尚未配置数据库。" }); return; }
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    res.status(400).json({ error: "请输入有效邮箱，密码至少 8 位。" }); return;
  }
  try {
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    await transaction(async (client) => {
      await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [id, email, passwordHash]);
      await client.query("INSERT INTO wallets(user_id,points) VALUES($1,50)", [id]);
      await client.query("INSERT INTO asset_ledger(id,user_id,amount,reason) VALUES($1,$2,50,$3)", [crypto.randomUUID(), id, "初次见面礼"]);
    });
    res.status(201).json({ token: createToken(id), user: { id, email }, points: 50, assets: [] });
  } catch (error) {
    const code = (error as { code?: string }).code;
    res.status(code === "23505" ? 409 : 500).json({ error: code === "23505" ? "这个邮箱已经注册。" : "注册失败。" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  if (!db) { res.status(503).json({ error: "服务器尚未配置数据库。" }); return; }
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const result = await db.query("SELECT id,email,password_hash FROM users WHERE email=$1", [email]);
  const user = result.rows[0] as { id: string; email: string; password_hash: string } | undefined;
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    res.status(401).json({ error: "邮箱或密码不正确。" }); return;
  }
  res.json({ token: createToken(user.id), user: { id: user.id, email: user.email } });
});

app.get("/api/account", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const [user, wallet, assets, inventory, activity, pendingEvent] = await Promise.all([
    db!.query("SELECT id,email,created_at FROM users WHERE id=$1", [userId]),
    db!.query("SELECT points FROM wallets WHERE user_id=$1", [userId]),
    db!.query("SELECT asset_id FROM user_assets WHERE user_id=$1 ORDER BY acquired_at", [userId]),
    db!.query("SELECT item_id,quantity FROM user_inventory WHERE user_id=$1 AND quantity>0", [userId]),
    db!.query("SELECT last_checkin,checkin_streak FROM user_activity WHERE user_id=$1", [userId]),
    db!.query("SELECT id,event_id FROM event_instances WHERE user_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1", [userId]),
  ]);
  if (!user.rows[0]) { res.status(404).json({ error: "账号不存在。" }); return; }
  res.json({
    user: user.rows[0], points: wallet.rows[0]?.points ?? 0,
    assets: assets.rows.map((row) => row.asset_id),
    inventory: Object.fromEntries(inventory.rows.map((row) => [row.item_id, Number(row.quantity)])),
    lastCheckIn: activity.rows[0]?.last_checkin ? new Date(activity.rows[0].last_checkin).toISOString().slice(0, 10) : null,
    checkInStreak: Number(activity.rows[0]?.checkin_streak ?? 0),
    pendingEvent: pendingEvent.rows[0]
      ? { instanceId: pendingEvent.rows[0].id, event: RANDOM_EVENTS.find((item) => item.id === pendingEvent.rows[0].event_id) || null }
      : null,
  });
});

app.put("/api/cloud-save", requireAuth, async (req: AuthRequest, res) => {
  const payload = req.body?.payload;
  if (!payload || typeof payload !== "object" || payload.version !== 1) {
    res.status(400).json({ error: "存档格式无效。" }); return;
  }
  await db!.query(`INSERT INTO cloud_saves(user_id,version,payload,updated_at) VALUES($1,1,$2,NOW())
    ON CONFLICT(user_id) DO UPDATE SET version=1,payload=EXCLUDED.payload,updated_at=NOW()`, [req.userId, payload]);
  res.json({ ok: true, updatedAt: Date.now() });
});

app.get("/api/cloud-save", requireAuth, async (req: AuthRequest, res) => {
  const result = await db!.query("SELECT payload,updated_at FROM cloud_saves WHERE user_id=$1", [req.userId]);
  if (!result.rows[0]) { res.status(404).json({ error: "还没有云存档。" }); return; }
  res.json({ payload: result.rows[0].payload, updatedAt: result.rows[0].updated_at });
});

app.post("/api/assets/purchase", requireAuth, async (req: AuthRequest, res) => {
  const product = SERVER_PRODUCTS[String(req.body?.productId || "")];
  if (!product) { res.status(404).json({ error: "商品不存在或尚未上架。" }); return; }
  try {
    const result = await transaction(async (client) => {
      if (product.type === "skin") {
        const owned = await client.query("SELECT 1 FROM user_assets WHERE user_id=$1 AND asset_id=$2", [req.userId, product.assetId]);
        if (owned.rowCount) throw new Error("已经拥有这件商品。");
      }
      const wallet = await client.query("SELECT points FROM wallets WHERE user_id=$1 FOR UPDATE", [req.userId]);
      const points = Number(wallet.rows[0]?.points ?? 0);
      if (points < product.price) throw new Error("心愿星不足。");
      await client.query("UPDATE wallets SET points=points-$1 WHERE user_id=$2", [product.price, req.userId]);
      if (product.type === "skin") await client.query("INSERT INTO user_assets(user_id,asset_id) VALUES($1,$2)", [req.userId, product.assetId]);
      else await client.query(`INSERT INTO user_inventory(user_id,item_id,quantity) VALUES($1,$2,1)
        ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+1`, [req.userId, product.refId]);
      await client.query("INSERT INTO asset_ledger(id,user_id,amount,reason,ref_id) VALUES($1,$2,$3,$4,$5)", [crypto.randomUUID(), req.userId, -product.price, "购买商品", product.refId]);
      const inventory = product.type === "gift"
        ? Number((await client.query("SELECT quantity FROM user_inventory WHERE user_id=$1 AND item_id=$2", [req.userId, product.refId])).rows[0].quantity)
        : undefined;
      return { points: points - product.price, type: product.type, refId: product.refId, assetId: product.assetId, quantity: inventory };
    });
    res.json(result);
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "购买失败。" }); }
});

app.post("/api/inventory/use", requireAuth, async (req: AuthRequest, res) => {
  const itemId = String(req.body?.itemId || "");
  if (!Object.values(SERVER_PRODUCTS).some((product) => product.type === "gift" && product.refId === itemId)) {
    res.status(400).json({ error: "礼物不存在。" }); return;
  }
  try {
    const quantity = await transaction(async (client) => {
      const current = await client.query("SELECT quantity FROM user_inventory WHERE user_id=$1 AND item_id=$2 FOR UPDATE", [req.userId, itemId]);
      if (Number(current.rows[0]?.quantity || 0) <= 0) throw new Error("背包里没有这件礼物。");
      await client.query("UPDATE user_inventory SET quantity=quantity-1 WHERE user_id=$1 AND item_id=$2", [req.userId, itemId]);
      return Number(current.rows[0].quantity) - 1;
    });
    res.json({ itemId, quantity });
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "使用礼物失败。" }); }
});

app.post("/api/rewards/check-in", requireAuth, async (req: AuthRequest, res) => {
  try {
    const result = await transaction(async (client) => {
      const today = String((await client.query("SELECT TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS today")).rows[0].today);
      const activity = await client.query("SELECT last_checkin,checkin_streak FROM user_activity WHERE user_id=$1 FOR UPDATE", [req.userId]);
      const last = activity.rows[0]?.last_checkin ? new Date(activity.rows[0].last_checkin).toISOString().slice(0, 10) : null;
      if (last === today) throw new Error("今天已经签到过了。");
      const yesterday = new Date(`${today}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const streak = last === yesterday.toISOString().slice(0, 10) ? Number(activity.rows[0]?.checkin_streak || 0) + 1 : 1;
      const bonus = streak % 7 === 0 ? 30 : streak % 3 === 0 ? 10 : 0;
      const amount = 10 + bonus;
      await client.query(`INSERT INTO user_activity(user_id,last_checkin,checkin_streak) VALUES($1,$2,$3)
        ON CONFLICT(user_id) DO UPDATE SET last_checkin=EXCLUDED.last_checkin,checkin_streak=EXCLUDED.checkin_streak`, [req.userId, today, streak]);
      await client.query("INSERT INTO reward_claims(user_id,claim_key,amount) VALUES($1,$2,$3)", [req.userId, `checkin:${today}`, amount]);
      await client.query("UPDATE wallets SET points=points+$1 WHERE user_id=$2", [amount, req.userId]);
      await client.query("INSERT INTO asset_ledger(id,user_id,amount,reason,ref_id) VALUES($1,$2,$3,$4,$5)", [crypto.randomUUID(), req.userId, amount, "每日签到", `checkin:${today}`]);
      const points = Number((await client.query("SELECT points FROM wallets WHERE user_id=$1", [req.userId])).rows[0].points);
      return { points, amount, streak, lastCheckIn: today };
    });
    res.json(result);
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "签到失败。" }); }
});

app.post("/api/events/trigger", requireAuth, async (req: AuthRequest, res) => {
  const source = ["checkin", "chat", "outing"].includes(String(req.body?.source)) ? String(req.body.source) : "chat";
  const affinity = Math.max(0, Math.min(100, Number(req.body?.affinity) || 0));
  try {
    const result = await transaction(async (client) => {
      const today = String((await client.query("SELECT TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS today")).rows[0].today);
      await client.query("SELECT points FROM wallets WHERE user_id=$1 FOR UPDATE", [req.userId]);
      const existing = await client.query("SELECT id,event_id FROM event_instances WHERE user_id=$1 AND status='pending' LIMIT 1", [req.userId]);
      if (existing.rows[0]) return { triggered: true, instanceId: existing.rows[0].id, event: RANDOM_EVENTS.find((item) => item.id === existing.rows[0].event_id) || null };
      const completed = Number((await client.query("SELECT COUNT(*) AS count FROM event_instances WHERE user_id=$1 AND event_date=$2 AND status='completed'", [req.userId, today])).rows[0].count);
      if (completed >= 2) return { triggered: false, reason: "daily-limit" };
      const completedIds = new Set((await client.query("SELECT event_id FROM event_instances WHERE user_id=$1 AND event_date=$2 AND status='completed'", [req.userId, today])).rows.map((row) => String(row.event_id)));
      const state = await client.query("SELECT attempts FROM event_trigger_state WHERE user_id=$1 AND event_date=$2 FOR UPDATE", [req.userId, today]);
      const attempts = Number(state.rows[0]?.attempts || 0) + 1;
      await client.query(`INSERT INTO event_trigger_state(user_id,event_date,attempts) VALUES($1,$2,$3)
        ON CONFLICT(user_id,event_date) DO UPDATE SET attempts=EXCLUDED.attempts`, [req.userId, today, attempts]);
      const roll = crypto.createHash("sha256").update(`${req.userId}:${today}:${source}:${attempts}`).digest()[0] % 100;
      if (roll >= 35 && attempts < 3) return { triggered: false, reason: "not-this-time", attempts };
      const eligible = RANDOM_EVENTS.filter((item) => item.minAffinity <= affinity && !completedIds.has(item.id));
      const pool = eligible.length ? eligible : RANDOM_EVENTS.filter((item) => item.minAffinity === 0 && !completedIds.has(item.id));
      const index = crypto.createHash("sha256").update(`${req.userId}:${today}:event:${attempts}`).digest()[0] % pool.length;
      const event = pool[index];
      const instanceId = crypto.randomUUID();
      await client.query("INSERT INTO event_instances(id,user_id,event_date,event_id,source) VALUES($1,$2,$3,$4,$5)", [instanceId, req.userId, today, event.id, source]);
      return { triggered: true, instanceId, event, attempts };
    });
    res.json(result);
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : "事件触发失败。" }); }
});

app.post("/api/rewards/event", requireAuth, async (req: AuthRequest, res) => {
  const instanceId = String(req.body?.instanceId || "");
  const eventId = String(req.body?.eventId || "");
  const choiceId = String(req.body?.choiceId || "");
  const event = RANDOM_EVENTS.find((item) => item.id === eventId);
  if (!event || !event.choices.some((item) => item.id === choiceId)) { res.status(400).json({ error: "事件或选项无效。" }); return; }
  try {
    const result = await transaction(async (client) => {
      const today = String((await client.query("SELECT TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS today")).rows[0].today);
      const claimKey = `event:${today}:${eventId}`;
      await client.query("SELECT points FROM wallets WHERE user_id=$1 FOR UPDATE", [req.userId]);
      const instance = await client.query("SELECT event_id,status FROM event_instances WHERE id=$1 AND user_id=$2 FOR UPDATE", [instanceId, req.userId]);
      if (!instance.rows[0] || instance.rows[0].status !== "pending" || instance.rows[0].event_id !== eventId) throw new Error("事件不存在、已完成或不属于当前账号。");
      const claimedToday = Number((await client.query("SELECT COUNT(*) AS count FROM reward_claims WHERE user_id=$1 AND claim_key LIKE $2", [req.userId, `event:${today}:%`])).rows[0].count);
      if (claimedToday >= 2) throw new Error("今天的事件奖励已经领满了。");
      const digest = crypto.createHash("sha256").update(`${req.userId}:${claimKey}:${choiceId}`).digest();
      const amount = 5 + digest[0] % 11;
      await client.query("INSERT INTO reward_claims(user_id,claim_key,amount) VALUES($1,$2,$3)", [req.userId, claimKey, amount]);
      await client.query("UPDATE wallets SET points=points+$1 WHERE user_id=$2", [amount, req.userId]);
      await client.query("INSERT INTO asset_ledger(id,user_id,amount,reason,ref_id) VALUES($1,$2,$3,$4,$5)", [crypto.randomUUID(), req.userId, amount, `事件：${event.title}`, claimKey]);
      await client.query("UPDATE event_instances SET status='completed',choice_id=$1,reward=$2,completed_at=NOW() WHERE id=$3", [choiceId, amount, instanceId]);
      const points = Number((await client.query("SELECT points FROM wallets WHERE user_id=$1", [req.userId])).rows[0].points);
      return { points, amount };
    });
    res.json(result);
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message = error instanceof Error ? error.message : "事件奖励发放失败。";
    res.status(code === "23505" || message.includes("领满") || message.includes("事件不存在") ? 409 : 500).json({ error: code === "23505" ? "这个事件奖励已经领取过了。" : message });
  }
});

app.get("/api/weather", async (req, res) => {
  const city = String(req.query.city || "").trim().slice(0, 80);
  const requestedLat = Number(req.query.lat);
  const requestedLon = Number(req.query.lon);
  const hasCoordinates = Number.isFinite(requestedLat) && Number.isFinite(requestedLon)
    && requestedLat >= -90 && requestedLat <= 90 && requestedLon >= -180 && requestedLon <= 180;
  if (!city && !hasCoordinates) {
    res.status(400).json({ error: "请允许定位或填写城市。" });
    return;
  }
  const cacheKey = hasCoordinates ? `${requestedLat.toFixed(2)},${requestedLon.toFixed(2)}` : city.toLocaleLowerCase();
  const cached = weatherCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.value);
    return;
  }
  try {
    let place: { name: string; admin1?: string; latitude: number; longitude: number };
    if (hasCoordinates) {
      place = { name: "当前位置", latitude: requestedLat, longitude: requestedLon };
    } else {
      const geoUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geoUrl.searchParams.set("name", city);
      geoUrl.searchParams.set("count", "1");
      geoUrl.searchParams.set("language", "zh");
      geoUrl.searchParams.set("format", "json");
      const geoResponse = await fetch(geoUrl, { signal: AbortSignal.timeout(10_000) });
      if (!geoResponse.ok) throw new Error(`城市查询失败（${geoResponse.status}）`);
      const geo = await geoResponse.json() as { results?: Array<{ name: string; admin1?: string; latitude: number; longitude: number }> };
      const found = geo.results?.[0];
      if (!found) { res.status(404).json({ error: `没有找到城市“${city}”。` }); return; }
      place = found;
    }

    const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
    forecastUrl.searchParams.set("latitude", String(place.latitude));
    forecastUrl.searchParams.set("longitude", String(place.longitude));
    forecastUrl.searchParams.set("current", "temperature_2m,apparent_temperature,weather_code,is_day");
    forecastUrl.searchParams.set("timezone", "auto");
    const forecastResponse = await fetch(forecastUrl, { signal: AbortSignal.timeout(10_000) });
    if (!forecastResponse.ok) throw new Error(`天气查询失败（${forecastResponse.status}）`);
    const forecast = await forecastResponse.json() as { current?: { temperature_2m: number; apparent_temperature: number; weather_code: number; is_day: number } };
    if (!forecast.current) throw new Error("天气服务没有返回当前天气。");
    const location = [place.name, place.admin1].filter(Boolean).join(" · ");
    const value: WeatherResponse = {
      location,
      temperature: Math.round(forecast.current.temperature_2m),
      apparentTemperature: Math.round(forecast.current.apparent_temperature),
      weatherCode: forecast.current.weather_code,
      label: weatherLabel(forecast.current.weather_code),
      isDay: forecast.current.is_day === 1,
      updatedAt: Date.now(),
    };
    weatherCache.set(cacheKey, { value, expiresAt: Date.now() + 30 * 60_000 });
    res.json(value);
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "天气服务连接超时，请稍后再试。"
      : error instanceof Error ? error.message : String(error);
    res.status(502).json({ error: message });
  }
});

app.post("/api/models", async (req, res) => {
  const { baseURL, apiKey } = (req.body ?? {}) as { baseURL?: string; apiKey?: string };
  if (!baseURL || !apiKey) {
    res.status(400).json({ error: "需要填写 接口地址 和 API Key。" });
    return;
  }
  let url = "";
  try {
    const base = normalizeBaseURL(baseURL);
    url = `${base}/models`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      res.status(502).json({ error: `供应商返回 ${r.status}：${t.slice(0, 200)}` });
      return;
    }
    const j: any = await r.json();
    const raw = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : [];
    const models: string[] = raw
      .map((m: any) => (typeof m === "string" ? m : m?.id))
      .filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
      .sort();
    res.json({ models });
  } catch (e) {
    const message = e instanceof TypeError || (e instanceof Error && e.name === "TimeoutError")
      ? fetchErrorMessage(e, url || baseURL)
      : e instanceof Error ? e.message : String(e);
    console.error("[ai-companion] 获取模型失败：", message);
    res.status(502).json({ error: message });
  }
});

app.post("/api/memory-analysis", async (req, res) => {
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

app.post("/api/diary-analysis", async (req, res) => {
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

app.post("/api/chat", async (req, res) => {
  const body = req.body as ChatBody;
  const context = body.context || {};
  const profile = context.profile && Number(context.profile.age) >= 18
    ? { ...DEFAULT_PROFILE, ...context.profile, name: String(context.profile.name || "可可").slice(0, 12), age: Math.min(99, Math.max(18, Number(context.profile.age))) }
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

async function streamAnthropic(
  res: express.Response,
  system: string,
  messages: ChatMsg[],
  isClosed: () => boolean,
) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    thinking: { type: "adaptive" },
    // @ts-expect-error output_config is a newer field not yet in all SDK typings
    output_config: { effort: "high" },
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
    if (!isClosed() && delta) sseSend(res, { type: "delta", text: delta });
  });
  await stream.finalMessage();
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
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const delta: string | undefined = json?.choices?.[0]?.delta?.content;
        if (delta) sseSend(res, { type: "delta", text: delta });
      } catch {
        // ignore keep-alive / partial lines
      }
    }
  }
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

if (IS_PRODUCTION) {
  const distDir = path.resolve(process.cwd(), "dist");
  if (!fs.existsSync(distDir)) throw new Error(`找不到前端构建目录：${distDir}`);
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

initPlatform()
  .then(() => app.listen(PORT, () => {
    const mode = process.env.ANTHROPIC_API_KEY ? "Anthropic" : "回声模式(无Key)";
    console.log(`[ai-companion] 后端已启动 http://localhost:${PORT} · 默认供应商: ${mode} · 数据库: ${db ? "已连接" : "未配置"}`);
  }))
  .catch((error) => {
    console.error("[ai-companion] 数据库初始化失败：", error);
    process.exitCode = 1;
  });
