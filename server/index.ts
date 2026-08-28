import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Agent, setGlobalDispatcher } from "undici";
setGlobalDispatcher(new Agent({ connect: { family: 4, timeout: 30_000 } }));
import path from "node:path";
import fs from "node:fs";
import { db, initPlatform } from "./platform.js";
import { createTtsRouter } from "./routes/tts.js";
import { createAccountRouter } from "./routes/account.js";
import { createWalletRouter } from "./routes/wallet.js";
import { createEventsRouter } from "./routes/events.js";
import { createWeatherRouter } from "./routes/weather.js";
import { createIntegrationsRouter } from "./routes/integrations.js";
import { createAiRouter } from "./routes/ai.js";
import { pikafish, type XiangqiDifficulty } from "./pikafish.js";
import { getAllXiangqiMoves, type XiangqiBoard } from "../src/game/xiangqi.js";

dotenv.config();

const app = express();
app.use((req, _res, next) => {
  if (req.url.includes("//")) {
    req.url = req.url.replace(/\/+/g, "/");
  }
  next();
});
app.use(cors());
app.use(express.json({ limit: "15mb" }));

const PORT = Number(process.env.PORT) || 8787;
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "claude-opus-4-7";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const requestBuckets = new Map<string, { count: number; resetAt: number }>();
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
app.use("/api", createTtsRouter());
app.use("/api", createIntegrationsRouter());
app.use(createAccountRouter());
app.use(createWalletRouter());
app.use(createEventsRouter());
app.use(createWeatherRouter());
app.use(createAiRouter());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    defaultProvider: process.env.ANTHROPIC_API_KEY ? "anthropic" : "echo",
    model: DEFAULT_MODEL,
    pikafish: pikafish.configured,
  });
});

app.post("/api/games/xiangqi/move", async (req, res) => {
  const board = req.body?.board as XiangqiBoard;
  const difficulty = String(req.body?.difficulty || "smart") as XiangqiDifficulty;
  const validDifficulty = new Set<XiangqiDifficulty>(["easy", "smart", "hard"]);
  if (!Array.isArray(board) || board.length !== 10 || board.some((row) => !Array.isArray(row) || row.length !== 9)) {
    res.status(400).json({ error: "棋盘数据无效。" }); return;
  }
  if (!validDifficulty.has(difficulty)) { res.status(400).json({ error: "难度无效。" }); return; }
  if (!pikafish.configured) { res.status(503).json({ error: "Pikafish 引擎尚未配置。" }); return; }
  try {
    const move = await pikafish.bestMove(board, difficulty);
    const legal = getAllXiangqiMoves(board, "black").some((item) => item.fromR === move.fromR && item.fromC === move.fromC && item.toR === move.toR && item.toC === move.toC);
    if (!legal) throw new Error("引擎返回了不合法的走法。");
    res.json({ move, engine: "pikafish" });
  } catch (error) {
    console.error("Pikafish move error:", error);
    res.status(503).json({ error: error instanceof Error ? error.message : "象棋引擎暂时不可用。" });
  }
});

if (IS_PRODUCTION) {
  const distDir = path.resolve(process.cwd(), "dist");
  if (!fs.existsSync(distDir)) throw new Error(`找不到前端构建目录：${distDir}`);
  app.use(express.static(distDir));
  app.get("*", (_req, res) => res.sendFile(path.join(distDir, "index.html")));
}

initPlatform()
  .then(() => app.listen(PORT, () => {
    const mode = process.env.ANTHROPIC_API_KEY ? "Anthropic" : "回声模式(无Key)";
    console.log(`[ai-companion] 后端已启动 http://localhost:${PORT} · 默认供应商: ${mode} · 数据库: ${db ? "已连接" : "未配置"} · 象棋: ${pikafish.configured ? "Pikafish" : "本地降级"}`);
  }))
  .catch((error) => {
    console.error("[ai-companion] 数据库初始化失败：", error);
    process.exitCode = 1;
  });
