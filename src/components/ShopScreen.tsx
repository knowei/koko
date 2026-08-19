import { useState } from "react";
import { SHOP_PRODUCTS } from "@/data/persona";
import { useStore } from "@/store/companionStore";

export function ShopScreen() {
  const points = useStore((state) => state.points);
  const inventory = useStore((state) => state.inventory);
  const unlockedSkins = useStore((state) => state.unlockedSkins);
  const activeSkin = useStore((state) => state.activeSkin);
  const buyProduct = useStore((state) => state.buyProduct);
  const equipSkin = useStore((state) => state.equipSkin);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 2200);
  };

  const gifts = SHOP_PRODUCTS.filter((product) => product.type === "gift");
  const skins = SHOP_PRODUCTS.filter((product) => product.type === "skin");

  return (
    <section className="shop-screen" aria-label="心愿商城">
      <header className="shop-header">
        <div><span>可可的</span><h2>心愿商城</h2><p>签到和完成随机事件可以获得心愿星。</p></div>
        <div className="shop-balance"><span>当前余额</span><strong>✦ {points}</strong></div>
      </header>

      <div className="shop-section">
        <div className="shop-section-title"><h3>衣橱</h3><span>购买后永久拥有，可以随时换装</span></div>
        <div className="skin-grid">
          <article className={`skin-card ${activeSkin === "blue" ? "equipped" : ""}`}>
            <div className="skin-preview"><img src="/assets/character/koko-base.png" alt="可可的浅蓝长裙" /></div>
            <div className="skin-info"><strong>浅蓝长裙</strong><span>{activeSkin === "blue" ? "使用中" : "已拥有"}</span></div>
            {activeSkin !== "blue" && <button onClick={() => flash(equipSkin("blue"))}>换上</button>}
          </article>
          {skins.map((product) => {
            const owned = unlockedSkins.includes(product.refId);
            const equipped = product.available !== false && activeSkin === product.refId;
            return (
              <article key={product.id} className={`skin-card ${equipped ? "equipped" : ""}`}>
                {product.available === false ? <div className="skin-preview skin-coming" aria-label="皮肤制作中">👗</div> : <div className="skin-preview mint"><img src="/assets/character/koko-base-green.png" alt="可可的薄荷绿裙" /></div>}
                <div className="skin-info"><strong>{product.name}</strong><span>{product.available === false ? "制作中" : equipped ? "使用中" : owned ? "已拥有" : `✦ ${product.price}`}</span></div>
                {!equipped && <button disabled={product.available === false} onClick={() => { if (owned) flash(equipSkin(product.refId)); else void buyProduct(product.id).then(flash); }}>{product.available === false ? "敬请期待" : owned ? "换上" : "兑换"}</button>}
              </article>
            );
          })}
        </div>
      </div>

      <div className="shop-section">
        <div className="shop-section-title"><h3>礼物铺</h3><span>兑换后放入背包，每天最多赠送三件</span></div>
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
