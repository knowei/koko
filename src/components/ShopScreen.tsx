import { useState } from "react";
import { GIFTS, SHOP_PRODUCTS } from "@/data/persona";
import { useStore } from "@/store/companionStore";

export function ShopScreen() {
  const points = useStore((state) => state.points);
  const inventory = useStore((state) => state.inventory);
  const unlockedSkins = useStore((state) => state.unlockedSkins);
  const activeSkin = useStore((state) => state.activeSkin);
  const previewSkin = useStore((state) => state.previewSkin);
  const setPreviewSkin = useStore((state) => state.setPreviewSkin);
  const buyProduct = useStore((state) => state.buyProduct);
  const equipSkin = useStore((state) => state.equipSkin);
  const giveGift = useStore((state) => state.giveGift);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2400);
  };

  const gifts = SHOP_PRODUCTS.filter((product) => product.type === "gift");
  const skins = SHOP_PRODUCTS.filter((product) => product.type === "skin");

  const handleTryOn = (skinRef: string) => {
    if (previewSkin === skinRef) {
      setPreviewSkin(null);
      flash("已退出试穿模式");
    } else {
      setPreviewSkin(skinRef);
      flash(`正在试穿「${skinRef === "green" ? "薄荷绿裙" : "浅蓝长裙"}」，去陪伴或立绘看效果吧~`);
    }
  };

  const handleEquipOrBuy = async (productId: string, refId: string, owned: boolean) => {
    if (owned) {
      setPreviewSkin(null);
      flash(equipSkin(refId));
    } else {
      const result = await buyProduct(productId);
      if (result.startsWith("兑换成功")) {
        setPreviewSkin(null);
        equipSkin(refId);
        flash(`${result}（已自动换上新装扮✨）`);
      } else {
        flash(result);
      }
    }
  };

  const handleGiveGift = async (refId: string, giftName: string) => {
    const err = await giveGift(refId);
    if (err) {
      flash(err);
    } else {
      flash(`已成功送给可可一份「${giftName}」🎁`);
    }
  };

  return (
    <section className="screen shop-screen" aria-label="心愿商城">
      <div className="shop-header">
        <div>
          <h2>心愿商城</h2>
          <p>在这里兑换礼物与心仪装扮，给可可更多惊喜吧</p>
        </div>
        <div className="shop-balance">
          <span>心愿星余额</span>
          <strong>✦ {points}</strong>
        </div>
      </div>

      {previewSkin && (
        <div className="shop-tryon-banner">
          <span>👗 当前处于试穿预览：{previewSkin === "green" ? "薄荷绿裙" : "浅蓝长裙"}</span>
          <button onClick={() => setPreviewSkin(null)}>结束试穿</button>
        </div>
      )}

      <div className="shop-section">
        <div className="shop-section-title">
          <h3>衣橱新装</h3>
          <span>点击试穿可在立绘中预览；兑换后永久拥有，随时切换</span>
        </div>
        <div className="skin-grid">
          {/* Base skin: blue */}
          <article className={`skin-card ${activeSkin === "blue" ? "equipped" : ""} ${previewSkin === "blue" ? "previewing" : ""}`}>
            <div className="skin-preview">
              <img src="./assets/character/koko-base.png" alt="可可的浅蓝长裙" />
            </div>
            <div className="skin-info">
              <strong>浅蓝长裙</strong>
              <span>{activeSkin === "blue" ? "使用中" : previewSkin === "blue" ? "试穿中" : "已拥有"}</span>
            </div>
            <div className="skin-actions">
              <button className="try-btn" onClick={() => handleTryOn("blue")}>
                {previewSkin === "blue" ? "还原" : "试穿"}
              </button>
              {activeSkin !== "blue" && (
                <button className="primary-skin-btn" onClick={() => { setPreviewSkin(null); flash(equipSkin("blue")); }}>
                  换上
                </button>
              )}
            </div>
          </article>

          {/* Other skins */}
          {skins.map((product) => {
            const owned = unlockedSkins.includes(product.refId);
            const equipped = product.available !== false && activeSkin === product.refId;
            const isPreviewing = previewSkin === product.refId;

            return (
              <article key={product.id} className={`skin-card ${equipped ? "equipped" : ""} ${isPreviewing ? "previewing" : ""}`}>
                <div className="skin-preview mint">
                  <img src="./assets/character/koko-base-green.png" alt="可可的薄荷绿裙" />
                </div>
                <div className="skin-info">
                  <strong>{product.name}</strong>
                  <span>{equipped ? "使用中" : isPreviewing ? "试穿中" : owned ? "已拥有" : `✦ ${product.price}`}</span>
                </div>
                <div className="skin-actions">
                  <button className="try-btn" onClick={() => handleTryOn(product.refId)}>
                    {isPreviewing ? "还原" : "试穿"}
                  </button>
                  {!equipped && (
                    <button
                      className="primary-skin-btn"
                      disabled={product.available === false}
                      onClick={() => void handleEquipOrBuy(product.id, product.refId, owned)}
                    >
                      {owned ? "换上" : "兑换"}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="shop-section">
        <div className="shop-section-title">
          <h3>礼物铺</h3>
          <span>兑换后放入背包，每天最多赠送三件，提升亲密度与心情</span>
        </div>
        <div className="gift-shop-grid">
          {gifts.map((product) => {
            const giftMeta = GIFTS.find((g) => g.id === product.refId);
            const ownedCount = inventory[product.refId] ?? 0;
            return (
              <div key={product.id} className="gift-shop-card">
                <div className="gift-card-top">
                  <span className="gift-card-emoji">{product.emoji}</span>
                  <div className="gift-card-main-meta">
                    <div className="gift-card-title-row">
                      <strong className="gift-card-name">{product.name}</strong>
                      <span className="gift-card-price">✦ {product.price}</span>
                    </div>
                    <div className="gift-card-badges">
                      <span className="gift-stat-badge affinity">💖 亲密度 +{giftMeta?.affinity ?? 3}</span>
                      <span className="gift-stat-badge mood">🌸 心情 +{giftMeta?.mood ?? 5}</span>
                    </div>
                  </div>
                </div>
                {giftMeta?.description && (
                  <p className="gift-card-desc">{giftMeta.description}</p>
                )}
                <div className="gift-card-actions-bar">
                  <span className="gift-card-inventory">
                    背包拥有：<strong>{ownedCount}</strong>
                  </span>
                  <div className="gift-card-btn-group">
                    <button
                      type="button"
                      className="gift-buy-btn"
                      onClick={() => void buyProduct(product.id).then(flash)}
                    >
                      兑换
                    </button>
                    {ownedCount > 0 && (
                      <button
                        type="button"
                        className="gift-give-now-btn"
                        onClick={() => void handleGiveGift(product.refId, product.name)}
                      >
                        赠送 🎁
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {notice && <div className="shop-notice">{notice}</div>}
    </section>
  );
}
