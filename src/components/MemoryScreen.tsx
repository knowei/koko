import { useState } from "react";
import { useStore } from "@/store/companionStore";
import { POLAROIDS, type MemoryKind } from "@/data/persona";

const kindNames: Record<MemoryKind, string> = { name: "名字", preference: "喜好", habit: "习惯", important: "重要" };

export function MemoryScreen() {
  const memories = useStore((state) => state.memories);
  const messages = useStore((state) => state.messages);
  const diaries = useStore((state) => state.diaries);
  const affinity = useStore((state) => state.affinity);
  const unlockedSkins = useStore((state) => state.unlockedSkins);
  const addMemory = useStore((state) => state.addMemory);
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

  const [tab, setTab] = useState<"scrapbook" | "polaroids">("scrapbook");
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<MemoryKind>("important");
  const [agreementDraft, setAgreementDraft] = useState("");
  const [agreementDate, setAgreementDate] = useState("");
  const [activePolaroid, setActivePolaroid] = useState<string | null>(null);

  const isPolaroidUnlocked = (p: typeof POLAROIDS[number]) => {
    if (p.id === "photo_mint") return unlockedSkins.includes("green") || affinity >= p.minAffinity;
    return affinity >= p.minAffinity;
  };

  return (
    <section className="memory-screen">
      <header className="memory-hero">
        <div>
          <span>📖</span>
          <h2>我们的回忆手账</h2>
        </div>
        <p>{profile.name || "妹妹"}会把重要的话、每天发生的点滴与珍贵瞬间认真收藏起来。</p>
      </header>

      {/* Sub-Tabs: Scrapbook Diary vs Polaroid Gallery */}
      <div className="memory-tabs">
        <button
          className={`memory-tab-btn ${tab === "scrapbook" ? "active" : ""}`}
          onClick={() => setTab("scrapbook")}
        >
          📝 手账与日记
        </button>
        <button
          className={`memory-tab-btn ${tab === "polaroids" ? "active" : ""}`}
          onClick={() => setTab("polaroids")}
        >
          📷 拍立得相册 ({POLAROIDS.filter(isPolaroidUnlocked).length}/{POLAROIDS.length})
        </button>
      </div>

      {tab === "polaroids" ? (
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
              <p>{rollingSummary || "每积累 8 条真实聊天后，可可会在后台提炼共同经历、重要信息和明确的约定。"}</p>
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
                <div className="empty-memory">聊天里说“明天提醒我”“下次一起去……”时，{profile.name || "妹妹"}也会自动记在这里。</div>
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
                <div className="empty-memory">完成约定、一起外出、送礼物或经历随机事件后，会留下属于你们的共同回忆。</div>
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
                <strong>{profile.name || "妹妹"}记得你</strong>
                <span>{memories.length}/50</span>
              </div>
              <div className="memory-editor">
                <select value={kind} onChange={(event) => setKind(event.target.value as MemoryKind)}>
                  {Object.entries(kindNames).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
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
                {memories.map((memory) => (
                  <article key={memory.id} className="memory-record">
                    <span className={`memory-kind-tag ${memory.kind}`}>{kindNames[memory.kind]}</span>
                    <p>{memory.text}</p>
                    <button onClick={() => removeMemory(memory.id)} aria-label="删除记忆">×</button>
                  </article>
                ))}
              </div>
            </section>

            <section className="memory-page-card diary-page">
              <div className="tape-strip blue-tape" />
              <div className="memory-page-title">
                <strong>{profile.name || "妹妹"}的心情日记</strong>
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
