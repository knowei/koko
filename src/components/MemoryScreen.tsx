import { useState } from "react";
import { useStore } from "@/store/companionStore";
import type { MemoryKind } from "@/data/persona";

const kindNames: Record<MemoryKind, string> = { name: "名字", preference: "喜好", habit: "习惯", important: "重要" };

export function MemoryScreen() {
  const memories = useStore((state) => state.memories);
  const messages = useStore((state) => state.messages);
  const diaries = useStore((state) => state.diaries);
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
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<MemoryKind>("important");
  const [agreementDraft, setAgreementDraft] = useState("");
  const [agreementDate, setAgreementDate] = useState("");

  return (
    <section className="memory-screen">
      <header className="memory-hero">
        <div><span>📖</span><h2>我们的回忆</h2></div>
        <p>{profile.name}会把重要的话和每天真实发生的聊天认真记下来。</p>
      </header>

      <section className="memory-page-card memory-analysis-card">
        <div>
          <strong>记忆整理</strong>
          <p>{rollingSummary || "每积累 8 条真实聊天后，可可会在后台提炼共同经历、重要信息和明确的约定。"}</p>
        </div>
        <button disabled={analyzingMemory || !messages.some((message) => message.kind === "chat" && message.content.trim())} onClick={() => void refreshMemoryAnalysis()}>
          {analyzingMemory ? "整理中…" : "整理最近聊天"}
        </button>
      </section>

      <section className="memory-page-card agreement-page">
        <div className="memory-page-title"><strong>我们约好的事</strong><span>待完成 {agreements.filter((item) => item.status === "pending").length}</span></div>
        <div className="agreement-editor">
          <input value={agreementDraft} maxLength={80} onChange={(event) => setAgreementDraft(event.target.value)} placeholder="例如：周末一起去看电影" />
          <input type="date" value={agreementDate} onChange={(event) => setAgreementDate(event.target.value)} />
          <button onClick={() => { addAgreement(agreementDraft, agreementDate || null); setAgreementDraft(""); setAgreementDate(""); }}>约好啦</button>
        </div>
        <div className="agreement-list">
          {agreements.length === 0 && <div className="empty-memory">聊天里说“明天提醒我”“下次一起去……”时，可可也会自动记在这里。</div>}
          {[...agreements].reverse().map((agreement) => (
            <article key={agreement.id} className={`agreement-item ${agreement.status}`}>
              <div><strong>{agreement.text}</strong><span>{agreement.dueDate ? `预计 ${agreement.dueDate}` : "还没定时间"}</span></div>
              {agreement.status === "pending" ? <div className="agreement-actions">
                <button onClick={() => updateAgreementStatus(agreement.id, "completed")}>完成了</button>
                <button onClick={() => snoozeAgreement(agreement.id)}>改到明天</button>
                <button onClick={() => updateAgreementStatus(agreement.id, "cancelled")}>取消</button>
              </div> : <em>{agreement.status === "completed" ? "已完成 · 已写入共同经历" : "已取消"}</em>}
            </article>
          ))}
        </div>
      </section>

      <section className="memory-page-card experience-page">
        <div className="memory-page-title"><strong>共同经历</strong><span>{experiences.length}件</span></div>
        <div className="experience-grid">
          {experiences.length === 0 && <div className="empty-memory">完成约定、一起外出、送礼物或经历随机事件后，会留下属于你们的共同回忆。</div>}
          {[...experiences].reverse().slice(0, 12).map((experience) => (
            <article key={experience.id} className={`experience-record ${experience.kind}`}>
              <div><span>{new Date(experience.ts).toLocaleDateString("zh-CN")}</span><button onClick={() => removeExperience(experience.id)}>删除</button></div>
              <strong>{experience.title}</strong><p>{experience.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="memory-columns">
        <section className="memory-page-card">
          <div className="memory-page-title"><strong>可可记得你</strong><span>{memories.length}/50</span></div>
          <div className="memory-editor">
            <select value={kind} onChange={(event) => setKind(event.target.value as MemoryKind)}>
              {Object.entries(kindNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input value={draft} maxLength={80} onChange={(event) => setDraft(event.target.value)} placeholder="写下一件希望她记住的事" />
            <button onClick={() => { addMemory(draft, kind); setDraft(""); }}>记住</button>
          </div>
          <div className="memory-records">
            {memories.length === 0 && <div className="empty-memory">聊天中说出名字、喜好、习惯或近期安排后，这里会慢慢出现记录。</div>}
            {memories.map((memory) => (
              <article key={memory.id} className="memory-record">
                <span>{kindNames[memory.kind]}</span><p>{memory.text}</p>
                <button onClick={() => removeMemory(memory.id)} aria-label="删除记忆">×</button>
              </article>
            ))}
          </div>
        </section>

        <section className="memory-page-card diary-page">
          <div className="memory-page-title"><strong>{profile.name}的日记</strong><span>{diaries.length}篇</span></div>
          <button className="diary-refresh" disabled={analyzingDiary || !messages.some((message) => message.kind === "chat" && message.role === "user")} onClick={() => void refreshDiaryAnalysis()}>
            {analyzingDiary ? "正在整理今天…" : "用模型整理今日日记"}
          </button>
          <div className="diary-list">
            {diaries.length === 0 && <div className="empty-memory">今天完成一次真实聊天后，第一篇日记会出现在这里。</div>}
            {[...diaries].reverse().map((diary) => (
              <article key={diary.date} className="diary-entry">
                <div className="diary-heading"><strong>{diary.title}</strong><button onClick={() => removeDiary(diary.date)}>删除</button></div>
                {diary.emotion && <div className="diary-emotion">今日情绪 · {diary.emotion}{diary.sealed ? " · 已封存" : " · 持续记录中"}</div>}
                <p>{diary.content}</p>
                {diary.carryover && <div className="diary-carryover">下次想继续：{diary.carryover}</div>}
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
