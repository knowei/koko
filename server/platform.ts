import "dotenv/config";
import crypto from "node:crypto";
import { Pool, type PoolClient } from "pg";
import type { NextFunction, Request, Response } from "express";

const DATABASE_URL = process.env.DATABASE_URL || "";
const AUTH_SECRET = process.env.AUTH_SECRET || "dev-only-change-me";
export const db = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL }) : null;

export async function initPlatform() {
  if (process.env.NODE_ENV === "production" && (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)) {
    throw new Error("生产环境必须配置至少 32 位的 AUTH_SECRET。");
  }
  if (!db) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cloud_saves (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1, payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS email_verification_codes (
      email TEXT NOT NULL, purpose TEXT NOT NULL, code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      send_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(email, purpose)
    );
    CREATE TABLE IF NOT EXISTS wallets (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      points INTEGER NOT NULL DEFAULT 50 CHECK(points >= 0)
    );
    CREATE TABLE IF NOT EXISTS asset_ledger (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL, reason TEXT NOT NULL, ref_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS user_assets (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL, acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id, asset_id)
    );
    CREATE TABLE IF NOT EXISTS user_inventory (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity >= 0),
      PRIMARY KEY(user_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS reward_claims (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claim_key TEXT NOT NULL, amount INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(user_id, claim_key)
    );
    CREATE TABLE IF NOT EXISTS user_activity (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_checkin DATE, checkin_streak INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS event_trigger_state (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_date DATE NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(user_id, event_date)
    );
    CREATE TABLE IF NOT EXISTS event_instances (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_date DATE NOT NULL, event_id TEXT NOT NULL, source TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed')),
      choice_id TEXT, reward INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );
    CREATE UNIQUE INDEX IF NOT EXISTS one_pending_event_per_user
      ON event_instances(user_id) WHERE status='pending';
  `);
}

const encode = (value: string) => Buffer.from(value).toString("base64url");
function sign(payload: string) {
  return crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
}
export function createToken(userId: string) {
  const payload = encode(JSON.stringify({ sub: userId, exp: Date.now() + 30 * 24 * 60 * 60_000 }));
  return `${payload}.${sign(payload)}`;
}
function readToken(token: string): string | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || signature.length !== sign(payload).length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: string; exp?: number };
    return value.sub && value.exp && value.exp > Date.now() ? value.sub : null;
  } catch { return null; }
}

export interface AuthRequest extends Request { userId?: string }
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  if (!db) { res.status(503).json({ error: "服务器尚未配置数据库。" }); return; }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const userId = readToken(token);
  if (!userId) { res.status(401).json({ error: "请先登录。" }); return; }
  req.userId = userId;
  next();
}

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(`${salt}:${key.toString("hex")}`));
  });
}
export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, expected] = stored.split(":");
    if (!salt || !expected) { resolve(false); return; }
    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) { reject(error); return; }
      const actual = key.toString("hex");
      resolve(actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected)));
    });
  });
}

export async function transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!db) throw new Error("数据库未配置");
  const client = await db.connect();
  try { await client.query("BEGIN"); const value = await run(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export const SERVER_PRODUCTS: Record<string, { price: number; type: "gift" | "skin"; refId: string; assetId?: string }> = {
  gift_milk_tea: { price: 20, type: "gift", refId: "milk_tea" },
  gift_flower: { price: 30, type: "gift", refId: "flower" },
  gift_book: { price: 35, type: "gift", refId: "book" },
  gift_cat: { price: 60, type: "gift", refId: "cat" },
  gift_cake: { price: 45, type: "gift", refId: "cake" },
  skin_green: { price: 300, type: "skin", refId: "green", assetId: "skin:green" },
};
