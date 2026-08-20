import { useState } from "react";
import { SHOP_PRODUCTS } from "@/data/persona";
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

  return (
    <section className="shop-screen" aria-label="心愿商城">
      <header className="shop-header">
        <div>
          <span>可可的</span>
          <h2>心愿商城</h2>
          <p>签到、完成随机事件和外出可以获得心愿星。</p>
        </div>
        <div className="shop-balance">
          <span>当前余额</span>
          <strong>✦ {points}</strong>
        </div>
      </header>

      {previewSkin && (
        <div className="shop-tryon-banner">
          <span>👗 当前处于试穿预览：{previewSkin === "green" ? "薄荷绿裙" : "浅蓝长裙"}</span>
          <button onClick={() => setPreviewSkin(null)}>结束试穿</button>
        </div>
      )}

      <div className="shop-section">
        <div className="shop-section-title">
          <h3>衣橱</h3>
          <span>点击「试穿」可即时在立绘上预览，购买后永久拥有</span>
        </div>
        <div className="skin-grid">
          {/* Base skin: blue */}
          <article className={`skin-card ${activeSkin === "blue" ? "equipped" : ""} ${previewSkin === "blue" ? "previewing" : ""}`}>
            <div className="skin-preview">
              <img src="/assets/character/koko-base.png" alt="可可的浅蓝长裙" />
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
                  <img src="/assets/character/koko-base-green.png" alt="可可的薄荷绿裙" />
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
          {gifts.map((product) => (
            <button key={product.id} className="gift-product" onClick={() => void buyProduct(product.id).then(flash)}>
              <span className="gift-product-emoji">{product.emoji}</span>
              <strong>{product.name}</strong>
              <span>背包 ×{inventory[product.refId] ?? 0}</span>
              <small>✦ {product.price}</small>
            </button>
          ))}
        </div>
      </div>
      {notice && <div className="shop-notice">{notice}</div>}
    </section>
  );
}
