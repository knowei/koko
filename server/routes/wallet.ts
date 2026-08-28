import crypto from "node:crypto";
import { Router } from "express";
import {
  requireAuth,
  SERVER_PRODUCTS,
  transaction,
  type AuthRequest,
} from "../platform.js";

export function createWalletRouter() {
  const router = Router();

  router.post("/api/assets/purchase", requireAuth, async (req: AuthRequest, res) => {
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
  
  router.post("/api/inventory/use", requireAuth, async (req: AuthRequest, res) => {
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
  

  return router;
}
