import crypto from "node:crypto";
import { Router } from "express";
import { RANDOM_EVENTS } from "../../src/data/persona.js";
import { isEmailConfigured, sendEmailVerificationCode } from "../email.js";
import {
  createToken,
  db,
  hashPassword,
  requireAuth,
  transaction,
  type AuthRequest,
  verifyPassword,
} from "../platform.js";

export function createAccountRouter() {
  const router = Router();
  const registerPurpose = "register";
  const resetPurpose = "reset_password";
  const codeExpiresMinutes = Math.max(5, Number(process.env.EMAIL_CODE_EXPIRES_MINUTES || 10));
  const hashCode = (purpose: string, email: string, code: string) => crypto
    .createHmac("sha256", process.env.AUTH_SECRET || "dev-only-change-me")
    .update(`${purpose}:${email}:${code}`)
    .digest("hex");

  router.post("/api/auth/register/code", async (req, res) => {
    if (!db) { res.status(503).json({ error: "服务器尚未配置数据库。" }); return; }
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      res.status(400).json({ error: "请输入有效的邮箱地址。" }); return;
    }
    if (!isEmailConfigured()) {
      res.status(503).json({ error: "邮件服务尚未配置，请联系管理员。" }); return;
    }
    try {
      const user = await db.query("SELECT 1 FROM users WHERE email=$1", [email]);
      if (user.rows[0]) { res.status(409).json({ error: "这个邮箱已经注册，请直接登录。" }); return; }
      const existing = await db.query(
        `SELECT EXTRACT(EPOCH FROM (NOW()-last_sent_at)) AS seconds_since_send,
          EXTRACT(EPOCH FROM (NOW()-window_started_at)) AS seconds_since_window, send_count
         FROM email_verification_codes WHERE email=$1 AND purpose=$2`,
        [email, registerPurpose],
      );
      const row = existing.rows[0] as { seconds_since_send: string; seconds_since_window: string; send_count: number } | undefined;
      if (row && Number(row.seconds_since_send) < 60) {
        res.status(429).json({ error: `请 ${Math.ceil(60 - Number(row.seconds_since_send))} 秒后再发送。` }); return;
      }
      if (row && Number(row.seconds_since_window) < 3600 && Number(row.send_count) >= 5) {
        res.status(429).json({ error: "发送过于频繁，请一小时后再试。" }); return;
      }
      const code = crypto.randomInt(100000, 1_000_000).toString();
      await db.query(
        `INSERT INTO email_verification_codes(email,purpose,code_hash,expires_at)
         VALUES($1,$2,$3,NOW()+($4 * INTERVAL '1 minute'))
         ON CONFLICT(email,purpose) DO UPDATE SET
           code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, attempts=0,
           last_sent_at=NOW(),
           window_started_at=CASE WHEN email_verification_codes.window_started_at < NOW()-INTERVAL '1 hour' THEN NOW() ELSE email_verification_codes.window_started_at END,
           send_count=CASE WHEN email_verification_codes.window_started_at < NOW()-INTERVAL '1 hour' THEN 1 ELSE email_verification_codes.send_count+1 END`,
        [email, registerPurpose, hashCode(registerPurpose, email, code), codeExpiresMinutes],
      );
      await sendEmailVerificationCode(email, code, codeExpiresMinutes, "register");
      res.json({ ok: true, message: "注册验证码已发送，请检查收件箱和垃圾邮件。" });
    } catch (error) {
      console.error("Registration email error:", error instanceof Error ? error.message : error);
      res.status(502).json({ error: "验证码邮件发送失败，请稍后重试。" });
    }
  });

  router.post("/api/auth/register", async (req, res) => {
    if (!db) { res.status(503).json({ error: "服务器尚未配置数据库。" }); return; }
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const code = String(req.body?.code || "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "请输入有效邮箱、6 位验证码和至少 8 位的密码。" }); return;
    }
    try {
      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      const registered = await transaction(async (client) => {
        const result = await client.query(
          `SELECT code_hash,expires_at,attempts FROM email_verification_codes
           WHERE email=$1 AND purpose=$2 FOR UPDATE`,
          [email, registerPurpose],
        );
        const verification = result.rows[0] as { code_hash: string; expires_at: Date; attempts: number } | undefined;
        const valid = verification
          && new Date(verification.expires_at).getTime() > Date.now()
          && verification.attempts < 5
          && crypto.timingSafeEqual(Buffer.from(verification.code_hash), Buffer.from(hashCode(registerPurpose, email, code)));
        if (!valid) {
          if (verification) {
            await client.query(
              "UPDATE email_verification_codes SET attempts=attempts+1 WHERE email=$1 AND purpose=$2",
              [email, registerPurpose],
            );
          }
          return false;
        }
        await client.query("INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)", [id, email, passwordHash]);
        await client.query("INSERT INTO wallets(user_id,points) VALUES($1,50)", [id]);
        await client.query("INSERT INTO asset_ledger(id,user_id,amount,reason) VALUES($1,$2,50,$3)", [crypto.randomUUID(), id, "初次见面礼"]);
        await client.query("DELETE FROM email_verification_codes WHERE email=$1 AND purpose=$2", [email, registerPurpose]);
        return true;
      });
      if (!registered) { res.status(400).json({ error: "验证码无效或已过期，请重新获取。" }); return; }
      res.status(201).json({ token: createToken(id), user: { id, email }, points: 50, assets: [] });
    } catch (error) {
      const code = (error as { code?: string }).code;
      res.status(code === "23505" ? 409 : 500).json({ error: code === "23505" ? "这个邮箱已经注册。" : "注册失败。" });
    }
  });
  
  router.post("/api/auth/login", async (req, res) => {
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
  
  router.post("/api/auth/password-reset/code", async (req, res) => {
    if (!db) { res.status(503).json({ error: "服务器尚未配置数据库。" }); return; }
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      res.status(400).json({ error: "请输入有效的邮箱地址。" }); return;
    }
    if (!isEmailConfigured()) {
      res.status(503).json({ error: "邮件服务尚未配置，请联系管理员。" }); return;
    }

    try {
      const user = await db.query("SELECT 1 FROM users WHERE email=$1", [email]);
      if (!user.rows[0]) {
        res.json({ ok: true, message: "如果该邮箱已注册，验证码将发送到邮箱。" }); return;
      }

      const existing = await db.query(
        `SELECT EXTRACT(EPOCH FROM (NOW()-last_sent_at)) AS seconds_since_send,
          EXTRACT(EPOCH FROM (NOW()-window_started_at)) AS seconds_since_window, send_count
         FROM email_verification_codes WHERE email=$1 AND purpose=$2`,
        [email, resetPurpose],
      );
      const row = existing.rows[0] as { seconds_since_send: string; seconds_since_window: string; send_count: number } | undefined;
      if (row && Number(row.seconds_since_send) < 60) {
        res.status(429).json({ error: `请 ${Math.ceil(60 - Number(row.seconds_since_send))} 秒后再发送。` }); return;
      }
      if (row && Number(row.seconds_since_window) < 3600 && Number(row.send_count) >= 5) {
        res.status(429).json({ error: "发送过于频繁，请一小时后再试。" }); return;
      }

      const code = crypto.randomInt(100000, 1_000_000).toString();
      await db.query(
        `INSERT INTO email_verification_codes(email,purpose,code_hash,expires_at)
         VALUES($1,$2,$3,NOW()+($4 * INTERVAL '1 minute'))
         ON CONFLICT(email,purpose) DO UPDATE SET
           code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, attempts=0,
           last_sent_at=NOW(),
           window_started_at=CASE WHEN email_verification_codes.window_started_at < NOW()-INTERVAL '1 hour' THEN NOW() ELSE email_verification_codes.window_started_at END,
           send_count=CASE WHEN email_verification_codes.window_started_at < NOW()-INTERVAL '1 hour' THEN 1 ELSE email_verification_codes.send_count+1 END`,
        [email, resetPurpose, hashCode(resetPurpose, email, code), codeExpiresMinutes],
      );
      await sendEmailVerificationCode(email, code, codeExpiresMinutes, "reset_password");
      res.json({ ok: true, message: "验证码已发送，请检查收件箱和垃圾邮件。" });
    } catch (error) {
      console.error("Password reset email error:", error instanceof Error ? error.message : error);
      res.status(502).json({ error: "验证码邮件发送失败，请稍后重试。" });
    }
  });

  router.post("/api/auth/reset-password", async (req, res) => {
    if (!db) { res.status(503).json({ error: "服务器尚未配置数据库。" }); return; }
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code) || newPassword.length < 8) {
      res.status(400).json({ error: "请输入有效邮箱、6 位验证码和至少 8 位的新密码。" }); return;
    }

    try {
      const passwordHash = await hashPassword(newPassword);
      const reset = await transaction(async (client) => {
        const result = await client.query(
          `SELECT code_hash,expires_at,attempts FROM email_verification_codes
           WHERE email=$1 AND purpose=$2 FOR UPDATE`,
          [email, resetPurpose],
        );
        const verification = result.rows[0] as { code_hash: string; expires_at: Date; attempts: number } | undefined;
        const valid = verification
          && new Date(verification.expires_at).getTime() > Date.now()
          && verification.attempts < 5
          && crypto.timingSafeEqual(Buffer.from(verification.code_hash), Buffer.from(hashCode(resetPurpose, email, code)));
        if (!valid) {
          if (verification) {
            await client.query(
              "UPDATE email_verification_codes SET attempts=attempts+1 WHERE email=$1 AND purpose=$2",
              [email, resetPurpose],
            );
          }
          return false;
        }
        const user = await client.query("UPDATE users SET password_hash=$1 WHERE email=$2 RETURNING id", [passwordHash, email]);
        await client.query("DELETE FROM email_verification_codes WHERE email=$1 AND purpose=$2", [email, resetPurpose]);
        return Boolean(user.rows[0]);
      });
      if (!reset) { res.status(400).json({ error: "验证码无效或已过期，请重新获取。" }); return; }
      res.json({ ok: true, message: "密码重置成功，请使用新密码登录。" });
    } catch (error) {
      console.error("Password reset error:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "重置密码失败，请稍后重试。" });
    }
  });
  
  router.get("/api/account", requireAuth, async (req: AuthRequest, res) => {
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
  
  router.put("/api/cloud-save", requireAuth, async (req: AuthRequest, res) => {
    const payload = req.body?.payload;
    if (!payload || typeof payload !== "object" || payload.version !== 1) {
      res.status(400).json({ error: "存档格式无效。" }); return;
    }
    await db!.query(`INSERT INTO cloud_saves(user_id,version,payload,updated_at) VALUES($1,1,$2,NOW())
      ON CONFLICT(user_id) DO UPDATE SET version=1,payload=EXCLUDED.payload,updated_at=NOW()`, [req.userId, payload]);
    res.json({ ok: true, updatedAt: Date.now() });
  });
  
  router.get("/api/cloud-save", requireAuth, async (req: AuthRequest, res) => {
    const result = await db!.query("SELECT payload,updated_at FROM cloud_saves WHERE user_id=$1", [req.userId]);
    if (!result.rows[0]) { res.status(404).json({ error: "还没有云存档。" }); return; }
    res.json({ payload: result.rows[0].payload, updatedAt: result.rows[0].updated_at });
  });
  

  return router;
}
