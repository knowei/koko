import { useState } from "react";
import { preferredOuting, useStore } from "@/store/companionStore";
import { GIFTS, OUTINGS, TOPICS, getPersonalityArchetype, type MemoryKind, type Outing } from "@/data/persona";
import { GALLERY_ITEMS, type GalleryItem } from "@/data/gallery";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function SidePanel({
  onOpenGames,
  onOpenFocus,
  onOpenSticky,
  onOpenLife,
  onOpenLorebook,
  onOpenCityMap,
}: {
  onOpenGames?: () => void;
  onOpenFocus?: () => void;
  onOpenSticky?: () => void;
  onOpenLife?: () => void;
  onOpenLorebook?: () => void;
  onOpenCityMap?: () => void;
}) {
  const affinity = useStore((s) => s.affinity);
  const mood = useStore((s) => s.mood);
  const lastCheckIn = useStore((s) => s.lastCheckIn);
  const dailyCheckIn = useStore((s) => s.dailyCheckIn);
  const giveGift = useStore((s) => s.giveGift);
  const tapTopic = useStore((s) => s.tapTopic);
  const personality = useStore((s) => s.personality);
  const lastOutingDate = useStore((s) => s.lastOutingDate);
  const goOut = useStore((s) => s.goOut);
  const points = useStore((s) => s.points);
  const inventory = useStore((s) => s.inventory);
  const checkInStreak = useStore((s) => s.checkInStreak);
  const profileName = useStore((s) => s.profile.name);
  const [toast, setToast] = useState<string | null>(null);
  const memories = useStore((s) => s.memories);
  const addMemory = useStore((s) => s.addMemory);
  const removeMemory = useStore((s) => s.removeMemory);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryKind, setMemoryKind] = useState<MemoryKind>("important");
  const [activeOutingPopup, setActiveOutingPopup] = useState<{
    outing: Outing;
    galleryItem?: GalleryItem;
    isWished: boolean;
  } | null>(null);

  const checkedInToday = lastCheckIn === todayStr();
  const topics = TOPICS.filter((t) => affinity >= t.minAffinity);
  const lockedNext = TOPICS.find((t) => affinity < t.minAffinity);
  const wishedOuting = preferredOuting(affinity, profileName);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const handleOutingClick = (outing: Outing) => {
    const isWished = wishedOuting.id === outing.id;
    const blocked = goOut(outing.id);
    if (blocked) {
      flash(blocked);
      return;
    }
    const matchingItem = GALLERY_ITEMS.find((item) => item.outingKey === outing.id);
    setActiveOutingPopup({ outing, galleryItem: matchingItem, isWished });
  };

  return (
    <aside className="side">
      <div className="wallet-card">
        <strong>✦ {points}</strong><span>心愿星</span><small>连续签到 {checkInStreak} 天</small>
      </div>
      <button
        className={`checkin ${checkedInToday ? "done" : ""}`}
        disabled={checkedInToday}
        onClick={() => void dailyCheckIn().then((message) => { if (message) flash(message); })}
      >
        {checkedInToday ? "今天已签到 ✓" : "📅 每日签到打招呼"}
      </button>

      {onOpenGames && (
        <div className="entertainment-banner-card" onClick={onOpenGames} role="button" tabIndex={0}>
          <div className="banner-icon-badge">🎮</div>
          <div className="banner-meta">
            <div className="banner-title-row">
              <strong>双人娱乐坊 · 6大互动游戏</strong>
              <span className="banner-new-tag">NEW ✨</span>
            </div>
            <small>象棋、围棋、五子棋、翻牌与默契测试</small>
          </div>
          <span className="banner-arrow">➔</span>
        </div>
      )}

      {/* Life Companion Action Grid */}
      <div className="life-quick-actions-grid">
        {onOpenFocus && (
          <div className="quick-life-card focus-card" onClick={onOpenFocus} role="button" tabIndex={0}>
            <span className="quick-life-icon">🍅</span>
            <div className="quick-life-info">
              <strong>专注番茄钟</strong>
              <small>沉浸白噪音伴读</small>
            </div>
          </div>
        )}
        {onOpenSticky && (
          <div className="quick-life-card sticky-card" onClick={onOpenSticky} role="button" tabIndex={0}>
            <span className="quick-life-icon">📝</span>
            <div className="quick-life-info">
              <strong>备忘便签</strong>
              <small>随手记下待办</small>
            </div>
          </div>
        )}
        {onOpenLife && (
          <div className="quick-life-card health-card" onClick={onOpenLife} role="button" tabIndex={0}>
            <span className="quick-life-icon">💧</span>
            <div className="quick-life-info">
              <strong>生活作息</strong>
              <small>8杯水与久坐提醒</small>
            </div>
          </div>
        )}
        {onOpenLorebook && (
          <div className="quick-life-card lorebook-card" onClick={onOpenLorebook} role="button" tabIndex={0}>
            <span className="quick-life-icon">📖</span>
            <div className="quick-life-info">
              <strong>专属世界书</strong>
              <small>设定与深度记忆</small>
            </div>
          </div>
        )}
      </div>

      {/* Dynamic Personality & Emotion Spectrum Card */}
      {(() => {
        const archetype = getPersonalityArchetype(personality, affinity, mood);
        return (
          <div className="side-block personality-matrix-card">
            <div className="side-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🎭 动态性格演化</span>
              <span
                style={{
                  fontSize: "11px",
                  padding: "2px 8px",
                  borderRadius: "10px",
                  background: `${archetype.badgeColor}20`,
                  color: archetype.badgeColor,
                  fontWeight: "700",
                }}
              >
                {archetype.name}
              </span>
            </div>

            <p style={{ margin: "4px 0 10px", fontSize: "11.5px", color: "#6b4a56", lineHeight: "1.45" }}>
              {archetype.description}
            </p>

            <div className="personality-traits-bars">
              <div className="trait-bar-row">
                <div className="trait-label"><span>🌸 温柔治愈</span><span>{personality.gentle ?? 35}</span></div>
                <div className="trait-track"><div className="trait-fill gentle" style={{ width: `${personality.gentle ?? 35}%` }} /></div>
              </div>

              <div className="trait-bar-row">
                <div className="trait-label"><span>🧸 元气黏人</span><span>{personality.clingy ?? 25}</span></div>
                <div className="trait-track"><div className="trait-fill clingy" style={{ width: `${personality.clingy ?? 25}%` }} /></div>
              </div>

              <div className="trait-bar-row">
                <div className="trait-label"><span>💢 傲娇嘴硬</span><span>{personality.tsundere ?? 20}</span></div>
                <div className="trait-track"><div className="trait-fill tsundere" style={{ width: `${personality.tsundere ?? 20}%` }} /></div>
              </div>

              <div className="trait-bar-row">
                <div className="trait-label"><span>🔪 独占病娇</span><span>{personality.possessive ?? 5}</span></div>
                <div className="trait-track"><div className="trait-fill possessive" style={{ width: `${personality.possessive ?? 5}%` }} /></div>
              </div>

              <div className="trait-bar-row">
                <div className="trait-label"><span>🌧️ 敏感自卑</span><span>{personality.insecure ?? 10}</span></div>
                <div className="trait-track"><div className="trait-fill insecure" style={{ width: `${personality.insecure ?? 10}%` }} /></div>
              </div>
            </div>

            <div className="locked-hint" style={{ marginTop: "9px" }}>
              💡 你的关怀、调侃、冷落或独占承诺，都会实时塑造她的真实性格与心境
            </div>
          </div>
        );
      })()}

      <div className="side-block">
        <div className="side-title">记住关于我的事</div>
        <div className="memory-input-row">
          <select value={memoryKind} onChange={(e) => setMemoryKind(e.target.value as MemoryKind)}>
            <option value="preference">喜好</option><option value="name">称呼</option>
            <option value="habit">习惯</option><option value="important">重要的事</option>
          </select>
          <input value={memoryDraft} maxLength={80} onChange={(e) => setMemoryDraft(e.target.value)} placeholder="例如：我怕黑" />
          <button onClick={() => { addMemory(memoryDraft, memoryKind); setMemoryDraft(""); }}>记住</button>
        </div>
        <div className="memory-list">
          {memories.length === 0 && <div className="locked-hint">聊天中提到的名字、喜好和重要安排也会自动记住</div>}
          {memories.map((memory) => (
            <div key={memory.id} className="memory-item"><span>{memory.text}</span><button onClick={() => removeMemory(memory.id)} title="忘掉这条">×</button></div>
          ))}
        </div>
      </div>

      <div className="side-block">
        <div className="side-title">聊点什么呀</div>
        <div className="chips">
          {topics.map((t) => (
            <button key={t.id} className="chip" onClick={() => tapTopic(t.label)}>
              {t.label}
            </button>
          ))}
        </div>
        {lockedNext && (
          <div className="locked-hint">
            🔒 亲密度 {lockedNext.minAffinity} 解锁「{lockedNext.label}」
          </div>
        )}
      </div>

      <div className="side-block">
        <div className="side-title">和{profileName || "妹妹"}外出探索</div>

        {/* 1. SLG City Map Exploration Banner */}
        {onOpenCityMap && (
          <div
            className="city-map-banner-card"
            onClick={onOpenCityMap}
            role="button"
            tabIndex={0}
            title="进入自由约会大地图，在城镇街头边走边聊，探索学校、电影院等特殊剧情！"
          >
            <div className="banner-icon-badge">🗺️</div>
            <div className="banner-meta">
              <div className="banner-title-row">
                <strong>城镇漫步 · 自由约会</strong>
                <span className="banner-new-tag">SLG 探索 ✨</span>
              </div>
              <small>💭 今日心愿：{wishedOuting.name} · 边走边聊</small>
            </div>
            <span className="banner-arrow">➔</span>
          </div>
        )}

        <div className="locked-hint" style={{ marginTop: 8 }}>⚡ 快捷打卡：选中心愿地点好感 ×2</div>
        <div className="outings">
          {OUTINGS.map((outing) => {
            const locked = affinity < outing.minAffinity;
            return (
              <button
                key={outing.id}
                className="outing"
                disabled={locked || lastOutingDate === todayStr()}
                title={locked ? `亲密度 ${outing.minAffinity} 解锁` : `心情 +${outing.mood}`}
                onClick={() => handleOutingClick(outing)}
              >
                <span>{outing.emoji}</span>{outing.name}
                {locked && <small>❤{outing.minAffinity}</small>}
              </button>
            );
          })}
        </div>
        <div className="locked-hint">{lastOutingDate === todayStr() ? "今天已经打过卡啦 ✓" : "随时可在漫步大地图中自由探索"}</div>
      </div>

      <div className="side-block">
        <div className="side-title">送给{profileName || "妹妹"}的小礼物</div>
        <div className="gifts">
          {GIFTS.map((g) => (
            <button
              key={g.id}
              className="gift"
              onClick={() => void giveGift(g.id).then((message) => { if (message) flash(message); })}
            >
              <span>{g.emoji}</span>
              <span>{g.name}</span>
              <small>×{inventory[g.id] ?? 0}</small>
            </button>
          ))}
        </div>
        <div className="locked-hint">每天最多收 3 次礼物，多余的可在商城兑换</div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {/* Outing CG Illustrated Result Modal */}
      {activeOutingPopup && (
        <div className="outing-modal-overlay" onClick={() => setActiveOutingPopup(null)}>
          <div className="outing-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="outing-modal-header">
              <h3>{activeOutingPopup.outing.emoji} 一起去了{activeOutingPopup.outing.name}！</h3>
              <button className="outing-modal-close" onClick={() => setActiveOutingPopup(null)}>✕</button>
            </div>
            {activeOutingPopup.galleryItem ? (
              <div className="outing-modal-photo-wrap">
                <img
                  src={activeOutingPopup.galleryItem.imageSrc}
                  alt={activeOutingPopup.galleryItem.title}
                  className="outing-modal-img"
                />
                <div className="outing-modal-badge">📸 纪念相册已收录新照片</div>
              </div>
            ) : null}
            <div className="outing-modal-body">
              {activeOutingPopup.isWished && (
                <div className="outing-wish-hit">✨ 心有灵犀！选中了她今天最想去的地方，亲密度奖励翻倍！</div>
              )}
              {activeOutingPopup.galleryItem?.caption ? (
                <p className="outing-modal-quote">{activeOutingPopup.galleryItem.caption}</p>
              ) : (
                <p className="outing-modal-quote">“今天和你在一起的时光，真是太开心啦~”</p>
              )}
            </div>
            <div className="outing-modal-footer">
              <button className="outing-modal-confirm-btn" onClick={() => setActiveOutingPopup(null)}>
                太好啦 💖
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
