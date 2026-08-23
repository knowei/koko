import { useState } from "react";
import { useStore } from "@/store/companionStore";
import { POLAROIDS, type MemoryKind } from "@/data/persona";

const kindConfig: Record<MemoryKind, { label: string; icon: string; color: string }> = {
  name: { label: "称呼与名字", icon: "👤", color: "#3b82f6" },
  preference: { label: "饮食与喜好", icon: "🍰", color: "#ec4899" },
  habit: { label: "生活作息习惯", icon: "☕", color: "#f59e0b" },
  work_study: { label: "工作与学业", icon: "💼", color: "#6366f1" },
  secret_mood: { label: "心情与小秘密", icon: "💖", color: "#8b5cf6" },
  important_date: { label: "纪念日与生日", icon: "🎂", color: "#ef4444" },
  important: { label: "重要约定与事项", icon: "📌", color: "#10b981" },
};

export function MemoryScreen() {
  const memories = useStore((state) => state.memories);
  const messages = useStore((state) => state.messages);
  const diaries = useStore((state) => state.diaries);
  const affinity = useStore((state) => state.affinity);
  const unlockedSkins = useStore((state) => state.unlockedSkins);
  const addMemory = useStore((state) => state.addMemory);
  const updateMemory = useStore((state) => state.updateMemory);
  const togglePinMemory = useStore((state) => state.togglePinMemory);
  const removeMemory = useStore((state) => state.removeMemory);
  const removeDiary = useStore((state) => state.removeDiary);
  const profile = useStore((state) => state.profile);
  const agreements = useStore((state) => state.agreements);
  const experiences = useStore((state) => state.experiences);
  const removeExperience = useStore((state) => state.removeExperience);
  const addAgreement = useStore((state) => state.addAgreement);
  const updateAgreementStatus = useStore((state) => state.updateAgreementStatus);
  const snoozeAgreement = useStore((state) => state.snoozeAgreement);
  const rollingSummary = useStore((state) => state.rollingSummary);
  const analyzingMemory = useStore((state) => state.analyzingMemory);
  const refreshMemoryAnalysis = useStore((state) => state.refreshMemoryAnalysis);
  const analyzingDiary = useStore((state) => state.analyzingDiary);
  const refreshDiaryAnalysis = useStore((state) => state.refreshDiaryAnalysis);

  const [tab, setTab] = useState<"scrapbook" | "profile" | "polaroids">("scrapbook");
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<MemoryKind>("preference");
  const [selectedKindFilter, setSelectedKindFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingKind, setEditingKind] = useState<MemoryKind>("preference");

  const [agreementDraft, setAgreementDraft] = useState("");
  const [agreementDate, setAgreementDate] = useState("");
  const [activePolaroid, setActivePolaroid] = useState<string | null>(null);

  const companionName = profile.name || "妹妹";

  const isPolaroidUnlocked = (p: typeof POLAROIDS[number]) => {
    if (p.id === "photo_mint") return unlockedSkins.includes("green") || affinity >= p.minAffinity;
    return affinity >= p.minAffinity;
  };

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

  const filteredMemories = memories.filter((m) => {
    if (selectedKindFilter !== "all" && m.kind !== selectedKindFilter) return false;
    if (searchQuery.trim() && !m.text.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
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
          📷 拍立得相册 ({POLAROIDS.filter(isPolaroidUnlocked).length}/{POLAROIDS.length})
        </button>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && draft.trim()) {
                    addMemory(draft.trim(), kind);
                    setDraft("");
                  }
                }}
              />
              <button
                className="memory-save-btn"
                onClick={() => {
                  if (!draft.trim()) return;
                  addMemory(draft.trim(), kind);
                  setDraft("");
                }}
              >
                记在心里 📌
              </button>
            </div>
          </div>

          {/* Filters and Search */}
          <div className="memory-filters-row">
            <div className="kind-filter-pills">
              <button
                className={`kind-pill ${selectedKindFilter === "all" ? "active" : ""}`}
                onClick={() => setSelectedKindFilter("all")}
              >
                全部 ({memories.length})
              </button>
              {Object.entries(kindConfig).map(([k, cfg]) => {
                const count = memories.filter((m) => m.kind === k).length;
                return (
                  <button
                    key={k}
                    className={`kind-pill ${selectedKindFilter === k ? "active" : ""}`}
                    onClick={() => setSelectedKindFilter(k)}
                  >
                    {cfg.icon} {cfg.label} ({count})
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              placeholder="🔍 搜索记忆关键词..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="memory-search-input"
            />
          </div>

          {/* Memory Tags / Cards Grid */}
          <div className="memory-cards-grid">
            {filteredMemories.length === 0 ? (
              <div className="memory-empty-state">
                <span className="empty-icon">💭</span>
                <p>
                  {searchQuery ? "没有找到匹配的记忆项" : `和${companionName}聊聊你的日常，她会自动记住关于你的一切哦~`}
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
                      <div className="memory-edit-inline">
                        <select
                          value={editingKind}
                          onChange={(e) => setEditingKind(e.target.value as MemoryKind)}
                          className="memory-kind-select small"
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
                          className="memory-input small"
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(m.id)}
                        />
                        <div className="edit-btn-row">
                          <button className="confirm-btn" onClick={() => handleSaveEdit(m.id)}>
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
                          <span className="kind-badge" style={{ backgroundColor: `${cfg.color}18`, color: cfg.color }}>
                            {cfg.icon} {cfg.label}
                          </span>
                          <div className="card-actions">
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
        <section className="polaroid-gallery">
          <div className="polaroid-header">
            <h3>珍贵瞬间 · 拍立得相册</h3>
            <span>随着亲密度提升、外出经历和换装，将逐步解锁专属珍贵照片</span>
          </div>
          <div className="polaroid-grid">
            {POLAROIDS.map((p) => {
              const unlocked = isPolaroidUnlocked(p);
              const isSelected = activePolaroid === p.id;

              return (
                <div
                  key={p.id}
                  className={`polaroid-card ${unlocked ? "unlocked" : "locked"} ${isSelected ? "selected" : ""}`}
                  onClick={() => unlocked && setActivePolaroid(isSelected ? null : p.id)}
                >
                  <div className="polaroid-tape" />
                  <div className="polaroid-photo">
                    {unlocked ? (
                      <img src={p.image} alt={p.title} />
                    ) : (
                      <div className="polaroid-lock-placeholder">
                        <span className="lock-icon">🔒</span>
                        <span className="lock-req">{p.condition}</span>
                      </div>
                    )}
                  </div>
                  <div className="polaroid-caption">
                    <div className="polaroid-title">{unlocked ? p.title : "未解锁的记忆"}</div>
                    <div className="polaroid-meta">{unlocked ? p.dateTag : `需亲密度 ${p.minAffinity}`}</div>
                    {unlocked && <p className="polaroid-quote">{p.caption}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
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
                placeholder="例如：周末一起去看电影、明天提醒我早起"
              />
              <input
                type="date"
                value={agreementDate}
                onChange={(event) => setAgreementDate(event.target.value)}
              />
              <button
                onClick={() => {
                  if (!agreementDraft.trim()) return;
                  addAgreement(agreementDraft, agreementDate || null);
                  setAgreementDraft("");
                  setAgreementDate("");
                }}
              >
                约好啦 ✍️
              </button>
            </div>
            <div className="agreement-list">
              {agreements.length === 0 && (
                <div className="empty-memory">聊天里说“明天提醒我”“下次一起去……”时，{companionName}也会自动记在这里。</div>
              )}
              {[...agreements].reverse().map((agreement) => (
                <article key={agreement.id} className={`agreement-item ${agreement.status}`}>
                  <div>
                    <strong>{agreement.text}</strong>
                    <span>{agreement.dueDate ? `📅 预计 ${agreement.dueDate}` : "还没定时间"}</span>
                  </div>
                  {agreement.status === "pending" ? (
                    <div className="agreement-actions">
                      <button className="done-btn" onClick={() => updateAgreementStatus(agreement.id, "completed")}>
                        完成了 ✓
                      </button>
                      <button className="snooze-btn" onClick={() => snoozeAgreement(agreement.id)}>
                        改到明天
                      </button>
                      <button className="cancel-btn" onClick={() => updateAgreementStatus(agreement.id, "cancelled")}>
                        取消
                      </button>
                    </div>
                  ) : (
                    <em className="agreement-status-tag">
                      {agreement.status === "completed" ? "已完成 · 写入共同经历 ✨" : "已取消"}
                    </em>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="memory-page-card experience-page">
            <div className="tape-strip pink-tape" />
            <div className="memory-page-title">
              <strong>共同经历纪事</strong>
              <span>共 {experiences.length} 篇</span>
            </div>
            <div className="experience-grid">
              {experiences.length === 0 && (
                <div className="empty-memory">完成约定、专注伴读、一起外出、送礼物或下棋后，会留下属于你们的共同回忆。</div>
              )}
              {[...experiences].reverse().slice(0, 12).map((experience) => (
                <article key={experience.id} className={`experience-record ${experience.kind}`}>
                  <div>
                    <span className="experience-date">{new Date(experience.ts).toLocaleDateString("zh-CN")}</span>
                    <button className="del-btn" onClick={() => removeExperience(experience.id)} title="删除记录">×</button>
                  </div>
                  <strong>{experience.title}</strong>
                  <p>{experience.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <div className="memory-columns">
            <section className="memory-page-card">
              <div className="tape-strip yellow-tape" />
              <div className="memory-page-title">
                <strong>{companionName}记得你</strong>
                <span>{memories.length}/50</span>
              </div>
              <div className="memory-editor">
                <select value={kind} onChange={(event) => setKind(event.target.value as MemoryKind)}>
                  {Object.entries(kindConfig).map(([value, cfg]) => (
                    <option key={value} value={value}>{cfg.label}</option>
                  ))}
                </select>
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
