import crypto from "node:crypto";
import { Router } from "express";
import { RANDOM_EVENTS } from "../../src/data/persona.js";
import {
  requireAuth,
  transaction,
  type AuthRequest,
} from "../platform.js";

export function createEventsRouter() {
  const router = Router();

  router.post("/api/rewards/check-in", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await transaction(async (client) => {
        const today = String((await client.query("SELECT TO_CHAR(NOW() AT TIME ZONE 'Asia/Shanghai','YYYY-MM-DD') AS today")).rows[0].today);
        const wallet = await client.query("SELECT points FROM wallets WHERE user_id=$1 FOR UPDATE", [req.userId]);
        if (!wallet.rows[0]) throw new Error("账号钱包不存在，请重新登录后再试。");
        const activity = await client.query("SELECT last_checkin,checkin_streak FROM user_activity WHERE user_id=$1 FOR UPDATE", [req.userId]);
        const last = activity.rows[0]?.last_checkin ? new Date(activity.rows[0].last_checkin).toISOString().slice(0, 10) : null;
        if (last === today) throw new Error("今天已经签到过了。");
        const yesterday = new Date(`${today}T00:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const streak = last === yesterday.toISOString().slice(0, 10) ? Number(activity.rows[0]?.checkin_streak || 0) + 1 : 1;
        const bonus = streak % 7 === 0 ? 30 : streak % 3 === 0 ? 10 : 0;
        const amount = 10 + bonus;
        const claim = await client.query(`INSERT INTO reward_claims(user_id,claim_key,amount) VALUES($1,$2,$3)
          ON CONFLICT(user_id,claim_key) DO NOTHING RETURNING amount`, [req.userId, `checkin:${today}`, amount]);
        if (!claim.rowCount) throw new Error("今天已经签到过了。");
        await client.query(`INSERT INTO user_activity(user_id,last_checkin,checkin_streak) VALUES($1,$2,$3)
          ON CONFLICT(user_id) DO UPDATE SET last_checkin=EXCLUDED.last_checkin,checkin_streak=EXCLUDED.checkin_streak`, [req.userId, today, streak]);
        await client.query("UPDATE wallets SET points=points+$1 WHERE user_id=$2", [amount, req.userId]);
        await client.query("INSERT INTO asset_ledger(id,user_id,amount,reason,ref_id) VALUES($1,$2,$3,$4,$5)", [crypto.randomUUID(), req.userId, amount, "每日签到", `checkin:${today}`]);
        const points = Number((await client.query("SELECT points FROM wallets WHERE user_id=$1", [req.userId])).rows[0].points);
        return { points, amount, streak, lastCheckIn: today };
      });
      res.json(result);
    } catch (error) {
      const message = error instanceof Error && !error.message.includes("duplicate key") ? error.message : "今天已经签到过了。";
      res.status(409).json({ error: message });
    }
  });
  
  router.post("/api/events/trigger", requireAuth, async (req: AuthRequest, res) => {
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
  
  router.post("/api/rewards/event", requireAuth, async (req: AuthRequest, res) => {
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
  


  return router;
}
