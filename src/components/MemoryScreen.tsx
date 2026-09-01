import { useState } from "react";
import { useStore } from "@/store/companionStore";
import { type MemoryKind } from "@/data/persona";
import { GALLERY_ITEMS, type GalleryItem } from "@/data/gallery";

const kindConfig: Record<MemoryKind, { label: string; icon: string; color: string }> = {
  name: { label: "称呼与名字", icon: "👤", color: "#3b82f6" },
  preference: { label: "饮食与喜好", icon: "🍰", color: "#ec4899" },
  habit: { label: "生活作息习惯", icon: "☕", color: "#f59e0b" },
  work_study: { label: "工作与学业", icon: "💼", color: "#6366f1" },
  secret_mood: { label: "心情与小秘密", icon: "💖", color: "#8b5cf6" },
  important_date: { label: "纪念日与生日", icon: "🎂", color: "#ef4444" },
  important: { label: "重要约定与事项", icon: "📌", color: "#10b981" },
};

export function MemoryScreen({ onOpenLorebook }: { onOpenLorebook?: () => void } = {}) {
  const memories = useStore((state) => state.memories);
  const messages = useStore((state) => state.messages);
  const diaries = useStore((state) => state.diaries);
  const affinity = useStore((state) => state.affinity);
  const addMemory = useStore((state) => state.addMemory);
  const updateMemory = useStore((state) => state.updateMemory);
  const togglePinMemory = useStore((state) => state.togglePinMemory);
  const removeMemory = useStore((state) => state.removeMemory);
  const removeDiary = useStore((state) => state.removeDiary);
  const profile = useStore((state) => state.profile);
  const agreements = useStore((state) => state.agreements);
  const addAgreement = useStore((state) => state.addAgreement);
  const updateAgreementStatus = useStore((state) => state.updateAgreementStatus);
  const snoozeAgreement = useStore((state) => state.snoozeAgreement);
  const rollingSummary = useStore((state) => state.rollingSummary);
  const analyzingMemory = useStore((state) => state.analyzingMemory);
  const refreshMemoryAnalysis = useStore((state) => state.refreshMemoryAnalysis);
  const analyzingDiary = useStore((state) => state.analyzingDiary);
  const refreshDiaryAnalysis = useStore((state) => state.refreshDiaryAnalysis);

  const unlockedGallery = useStore((state) => state.unlockedGallery) || [];
  const customBgImage = useStore((state) => state.customBgImage);
  const setCustomBgImage = useStore((state) => state.setCustomBgImage);

  const [tab, setTab] = useState<"scrapbook" | "profile" | "polaroids">("scrapbook");
  const [galleryFilter, setGalleryFilter] = useState<"all" | "daily" | "story_cg" | "intimate">("all");
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<MemoryKind>("preference");
  const [selectedKindFilter, setSelectedKindFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingKind, setEditingKind] = useState<MemoryKind>("preference");

  const [agreementDraft, setAgreementDraft] = useState("");
  const [agreementDate, setAgreementDate] = useState("");
  const [activeItem, setActiveItem] = useState<GalleryItem | null>(null);
  const [bgNotice, setBgNotice] = useState<string | null>(null);

  const companionName = profile.name || "妹妹";

  const isItemUnlocked = (item: GalleryItem) => {
    return unlockedGallery.includes(item.id) || affinity >= item.minAffinity;
  };

  const unlockedCount = GALLERY_ITEMS.filter(isItemUnlocked).length;

  const handleStartEdit = (m: typeof memories[number]) => {
    setEditingMemoryId(m.id);
    setEditingText(m.text);
    setEditingKind(m.kind);
  };

  const handleSaveEdit = (id: string) => {
    if (!editingText.trim()) return;
    updateMemory(id, editingText.trim(), editingKind);
    setEditingMemoryId(null);
  };

  const handleSetBg = (src: string) => {
    setCustomBgImage(src);
    setBgNotice("已成功设为主界面舞台背景！✨");
    setTimeout(() => setBgNotice(null), 3000);
  };

  const handleClearBg = () => {
    setCustomBgImage(null);
    setBgNotice("已恢复默认场景背景");
    setTimeout(() => setBgNotice(null), 3000);
  };

  const filteredMemories = memories.filter((m) => {
    if (selectedKindFilter !== "all" && m.kind !== selectedKindFilter) return false;
    if (searchQuery.trim() && !m.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredGallery = GALLERY_ITEMS.filter((item) => {
    if (galleryFilter === "all") return true;
    return item.category === galleryFilter;
  });

  return (
    <section className="memory-screen">
      <header className="memory-hero">
        <div>
          <span>📖</span>
          <h2>我们的回忆手账</h2>
        </div>
        <p>{companionName}会把重要的话、对你的了解、每天发生的点滴与珍贵瞬间认真收藏起来。</p>
      </header>

      {/* Sub-Tabs: Scrapbook Diary vs Profile Archive vs Polaroid Gallery */}
      <div className="memory-tabs">
        <button
          className={`memory-tab-btn ${tab === "scrapbook" ? "active" : ""}`}
          onClick={() => setTab("scrapbook")}
        >
          📝 手账与日记
        </button>
        <button
          className={`memory-tab-btn ${tab === "profile" ? "active" : ""}`}
          onClick={() => setTab("profile")}
        >
          🧠 记忆档案与画像 ({memories.length})
        </button>
        <button
          className={`memory-tab-btn ${tab === "polaroids" ? "active" : ""}`}
          onClick={() => setTab("polaroids")}
        >
          📸 珍藏相册与CG ({unlockedCount}/{GALLERY_ITEMS.length})
        </button>
        {onOpenLorebook && (
          <button
            className="memory-tab-btn"
            style={{
              background: "linear-gradient(135deg, #fff0f5, #ffe4e9)",
              border: "1px solid #f9c2d1",
              color: "#d81b60",
              fontWeight: "700",
            }}
            onClick={onOpenLorebook}
          >
            📖 专属世界书 ✨
          </button>
        )}
      </div>

      {tab === "profile" ? (
        /* Memory Profile Archive Tab */
        <section className="memory-profile-view">
          <div className="memory-profile-header">
            <div>
              <h3>{companionName}眼中的你 · 个人画像</h3>
              <p>在日常聊天中提到的喜好、习惯与秘密，妹妹都会深深记在心里，并在合适时机主动关心你~</p>
            </div>
          </div>

          {/* Add New Memory Form */}
          <div className="memory-add-card">
            <h4>✨ 告诉{companionName}关于你的一件事</h4>
            <div className="memory-add-form-row">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as MemoryKind)}
                className="memory-kind-select"
              >
                {Object.entries(kindConfig).map(([k, cfg]) => (
                  <option key={k} value={k}>
                    {cfg.icon} {cfg.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="例如：我最喜欢喝乌龙奶茶半糖 / 我生日是10月15日 / 我是前端工程师"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="memory-input"
                maxLength={80}
              />
              <button
                className="memory-submit-btn"
                onClick={() => {
                  if (!draft.trim()) return;
                  addMemory(draft.trim(), kind);
                  setDraft("");
                }}
              >
                记在心底 💖
              </button>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="memory-filter-bar">
            <div className="kind-filter-tags">
              <button
                className={`filter-tag-btn ${selectedKindFilter === "all" ? "active" : ""}`}
                onClick={() => setSelectedKindFilter("all")}
              >
                全部 ({memories.length})
              </button>
              {Object.entries(kindConfig).map(([k, cfg]) => {
                const count = memories.filter((m) => m.kind === k).length;
                return (
                  <button
                    key={k}
                    className={`filter-tag-btn ${selectedKindFilter === k ? "active" : ""}`}
                    onClick={() => setSelectedKindFilter(k)}
                  >
                    {cfg.icon} {cfg.label} ({count})
                  </button>
                );
              })}
            </div>
            <div className="search-box">
              <span>🔍</span>
              <input
                type="text"
                placeholder="搜索记忆片段…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="clear-search" onClick={() => setSearchQuery("")}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Memory List Cards */}
          <div className="memory-grid">
            {filteredMemories.length === 0 ? (
              <div className="memory-empty-state">
                <span className="empty-icon">📭</span>
                <p>
                  {searchQuery || selectedKindFilter !== "all"
                    ? "没有找到符合条件的记忆片段"
                    : "妹妹的笔记本还是崭新的~ 试着在聊天中多跟她说说你自己的事情吧！"}
                </p>
              </div>
            ) : (
              filteredMemories.map((m) => {
                const cfg = kindConfig[m.kind] || kindConfig.important;
                const isEditing = editingMemoryId === m.id;

                return (
                  <div
                    key={m.id}
                    className={`memory-item-card ${m.pinned ? "pinned" : ""}`}
                    style={{ borderLeftColor: cfg.color }}
                  >
                    {isEditing ? (
                      <div className="memory-edit-mode">
                        <select
                          value={editingKind}
                          onChange={(e) => setEditingKind(e.target.value as MemoryKind)}
                          className="memory-kind-select"
                        >
                          {Object.entries(kindConfig).map(([k, c]) => (
                            <option key={k} value={k}>
                              {c.icon} {c.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="memory-input"
                          maxLength={80}
                          autoFocus
                        />
                        <div className="edit-actions">
                          <button className="save-btn" onClick={() => handleSaveEdit(m.id)}>
                            保存
                          </button>
                          <button className="cancel-btn" onClick={() => setEditingMemoryId(null)}>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="memory-card-top">
                          <span className="memory-kind-badge" style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}>
                            {cfg.icon} {cfg.label}
                          </span>
                          <div className="memory-card-actions">
                            <button
                              className={`pin-btn ${m.pinned ? "active" : ""}`}
                              onClick={() => togglePinMemory(m.id)}
                              title={m.pinned ? "取消重要置顶" : "设为重要置顶"}
                            >
                              {m.pinned ? "⭐" : "☆"}
                            </button>
                            <button
                              className="edit-btn"
                              onClick={() => handleStartEdit(m)}
                              title="编辑记忆"
                            >
                              ✏️
                            </button>
                            <button
                              className="del-btn"
                              onClick={() => removeMemory(m.id)}
                              title="删除记忆"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        <p className="memory-text-content">{m.text}</p>
                        <div className="memory-card-time">
                          <span>{new Date(m.ts).toLocaleDateString("zh-CN")}</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      ) : tab === "polaroids" ? (
        /* Enhanced Photo & Story CG Gallery */
        <section className="polaroid-gallery">
          <div className="polaroid-header">
            <div>
              <h3>📸 珍藏相册与剧情 CG 画廊</h3>
              <p>随着亲密度提升、外出约会与日常陪伴，将逐步解锁可可的专属珍贵照片与剧情插画~</p>
            </div>
            {customBgImage && (
              <button className="gallery-reset-bg-btn" onClick={handleClearBg} title="恢复默认场景">
                🔄 恢复默认主舞台背景
              </button>
            )}
          </div>

          {bgNotice && <div className="gallery-toast-notice">{bgNotice}</div>}

          {/* Filter Categories */}
          <div className="gallery-filter-tabs">
            <button
              className={`gallery-filter-btn ${galleryFilter === "all" ? "active" : ""}`}
              onClick={() => setGalleryFilter("all")}
            >
              全部珍藏 ({GALLERY_ITEMS.length})
            </button>
            <button
              className={`gallery-filter-btn ${galleryFilter === "daily" ? "active" : ""}`}
              onClick={() => setGalleryFilter("daily")}
            >
              📷 日常拍立得 (9:16)
            </button>
            <button
              className={`gallery-filter-btn ${galleryFilter === "story_cg" ? "active" : ""}`}
              onClick={() => setGalleryFilter("story_cg")}
            >
              🎬 剧情大CG (16:9)
            </button>
            <button
              className={`gallery-filter-btn ${galleryFilter === "intimate" ? "active" : ""}`}
              onClick={() => setGalleryFilter("intimate")}
            >
              💖 卧室与私密珍藏
            </button>
          </div>

          <div className="polaroid-grid">
            {filteredGallery.map((p) => {
              const unlocked = isItemUnlocked(p);
              const isSelected = activeItem?.id === p.id;
              const isCurrentBg = customBgImage === p.imageSrc;

              return (
                <div
                  key={p.id}
                  className={`polaroid-card ${p.aspectRatio === "16:9" ? "wide-cg-card" : "portrait-card"} ${unlocked ? "unlocked" : "locked"} ${isSelected ? "selected" : ""}`}
                  onClick={() => unlocked && setActiveItem(p)}
                >
                  <div className="polaroid-tape" />
                  {isCurrentBg && <div className="current-bg-badge">当前舞台背景 🖼️</div>}
                  <div className={`polaroid-photo ${p.aspectRatio === "16:9" ? "aspect-16-9" : "aspect-9-16"}`}>
                    {unlocked ? (
                      <img src={p.imageSrc} alt={p.title} className="gallery-img-thumb" loading="lazy" />
                    ) : (
                      <div className="polaroid-lock-placeholder">
                        <span className="lock-icon">🔒</span>
                        <span className="lock-req">{p.condition}</span>
                      </div>
                    )}
                  </div>
                  <div className="polaroid-caption">
                    <div className="polaroid-title">{unlocked ? p.title : "未解锁的记忆"}</div>
                    <div className="polaroid-meta">{unlocked ? p.dateTag : `需亲密度 Lv.${p.minAffinity}`}</div>
                    {unlocked && <p className="polaroid-quote">{p.caption}</p>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Lightbox Fullscreen Modal */}
          {activeItem && (
            <div className="gallery-lightbox-overlay" onClick={() => setActiveItem(null)}>
              <div className="gallery-lightbox-modal" onClick={(e) => e.stopPropagation()}>
                <button className="lightbox-close-btn" onClick={() => setActiveItem(null)}>
                  ✕
                </button>
                <div className="lightbox-image-wrapper">
                  <img src={activeItem.imageSrc} alt={activeItem.title} className="lightbox-image" />
                </div>
                <div className="lightbox-info-panel">
                  <div className="lightbox-header">
                    <h4>{activeItem.title}</h4>
                    <span className="lightbox-date-badge">{activeItem.dateTag}</span>
                  </div>
                  <p className="lightbox-quote">{activeItem.caption}</p>
                  <div className="lightbox-actions">
                    <button
                      className="lightbox-action-btn set-bg"
                      onClick={() => handleSetBg(activeItem.imageSrc)}
                    >
                      🖼️ 设为应用背景
                    </button>
                    <a
                      href={activeItem.imageSrc}
                      download={`${activeItem.title}.jpg`}
                      className="lightbox-action-btn download"
                      target="_blank"
                      rel="noreferrer"
                    >
                      📥 导出原图壁纸
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : (
        /* Scrapbook Tab */
        <>
          <section className="memory-page-card memory-analysis-card">
            <div className="tape-strip" />
            <div>
              <strong>记忆整理与摘要</strong>
              <p>{rollingSummary || `每积累 8 条真实聊天后，${companionName}会在后台提炼共同经历、重要信息和明确的约定。`}</p>
            </div>
            <button
              disabled={analyzingMemory || !messages.some((message) => message.kind === "chat" && message.content.trim())}
              onClick={() => void refreshMemoryAnalysis()}
            >
              {analyzingMemory ? "整理中…" : "整理最近聊天"}
            </button>
          </section>

          <section className="memory-page-card agreement-page">
            <div className="tape-strip green-tape" />
            <div className="memory-page-title">
              <strong>约定清单 · 我们约好的事</strong>
              <span>待完成 {agreements.filter((item) => item.status === "pending").length} 件</span>
            </div>
            <div className="agreement-editor">
              <input
                value={agreementDraft}
                maxLength={80}
                onChange={(event) => setAgreementDraft(event.target.value)}
                placeholder="记录新的约定（例：周末一起看电影）"
              />
              <input
                type="date"
                value={agreementDate}
                onChange={(event) => setAgreementDate(event.target.value)}
                aria-label="约定到期日期"
              />
              <button
                onClick={() => {
                  if (!agreementDraft.trim()) return;
                  addAgreement(agreementDraft.trim(), agreementDate || null);
                  setAgreementDraft("");
                  setAgreementDate("");
                }}
              >
                添加约定 🤝
              </button>
            </div>
            <div className="agreement-list">
              {agreements.length === 0 && (
                <div className="empty-memory">还没有约定。聊天中提到“下次一起去…”或在此手动添加，便会出现在这里。</div>
              )}
              {agreements.map((item) => (
                <article key={item.id} className={`agreement-item ${item.status}`}>
                  <div className="agreement-main">
                    <span className="stamp-badge">
                      {item.status === "completed" ? "已履约" : item.status === "cancelled" ? "已取消" : "等待中"}
                    </span>
                    <p>{item.text}</p>
                  </div>
                  <div className="agreement-actions">
                    {item.dueDate && <small>约定：{item.dueDate}</small>}
                    {item.status === "pending" && (
                      <>
                        <button onClick={() => updateAgreementStatus(item.id, "completed")}>完成 ✨</button>
                        <button onClick={() => snoozeAgreement(item.id)}>推迟 ⏳</button>
                      </>
                    )}
                    {item.status !== "pending" && (
                      <button onClick={() => updateAgreementStatus(item.id, "pending")}>重开</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="memory-book">
            <section className="memory-page-card">
              <div className="tape-strip pink-tape" />
              <div className="memory-page-title">
                <strong>{companionName}的手账本</strong>
                <span>{memories.length} 条</span>
              </div>
              <div className="memory-form">
                <input
                  value={draft}
                  maxLength={80}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="写下一件希望她记住的事"
                />
                <button onClick={() => { if (!draft.trim()) return; addMemory(draft, kind); setDraft(""); }}>
                  记下 📌
                </button>
              </div>
              <div className="memory-records">
                {memories.length === 0 && (
                  <div className="empty-memory">聊天中说出名字、喜好、习惯或近期安排后，这里会慢慢出现记录。</div>
                )}
                {memories.slice(0, 10).map((memory) => {
                  const cfg = kindConfig[memory.kind] || kindConfig.important;
                  return (
                    <article key={memory.id} className="memory-record">
                      <span className={`memory-kind-tag ${memory.kind}`}>{cfg.label}</span>
                      <p>{memory.text}</p>
                      <button onClick={() => removeMemory(memory.id)} aria-label="删除记忆">×</button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="memory-page-card diary-page">
              <div className="tape-strip blue-tape" />
              <div className="memory-page-title">
                <strong>{companionName}的心情日记</strong>
                <span>{diaries.length} 篇</span>
              </div>
              <button
                className="diary-refresh"
                disabled={analyzingDiary || !messages.some((message) => message.kind === "chat" && message.role === "user")}
                onClick={() => void refreshDiaryAnalysis()}
              >
                {analyzingDiary ? "正在整理今天…" : "用模型整理今日日记 🖋️"}
              </button>
              <div className="diary-list">
                {diaries.length === 0 && (
                  <div className="empty-memory">今天完成一次真实聊天后，第一篇手账日记会出现在这里。</div>
                )}
                {[...diaries].reverse().map((diary) => (
                  <article key={diary.date} className="diary-entry">
                    <div className="diary-heading">
                      <strong>{diary.title}</strong>
                      <button onClick={() => removeDiary(diary.date)}>删除</button>
                    </div>
                    {diary.emotion && (
                      <div className="diary-emotion">
                        <span className="stamp-badge">
                          {diary.emotion}
                        </span>
                        {diary.sealed ? " · 已封存" : " · 持续记录中"}
                      </div>
                    )}
                    <p>{diary.content}</p>
                    {diary.carryover && (
                      <div className="diary-carryover">
                        💡 下次想继续：{diary.carryover}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </section>
  );
}
