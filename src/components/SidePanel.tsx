import { useState } from "react";
import { preferredOuting, useStore } from "@/store/companionStore";
import { GIFTS, OUTINGS, TOPICS, personalityLabel, type MemoryKind } from "@/data/persona";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function SidePanel() {
  const affinity = useStore((s) => s.affinity);
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

  const checkedInToday = lastCheckIn === todayStr();
  const topics = TOPICS.filter((t) => affinity >= t.minAffinity);
  const lockedNext = TOPICS.find((t) => affinity < t.minAffinity);
  const wishedOuting = preferredOuting(affinity, profileName);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
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

      <div className="personality-card">
        <span>现在的{profileName || "妹妹"}</span>
        <strong>{personalityLabel(personality, affinity)}</strong>
        <small>性格会随着你们的聊天慢慢变化</small>
      </div>

      <div className="side-block">
        <div className="side-title">{profileName || "妹妹"}记得你</div>
        <div className="memory-add">
          <select value={memoryKind} onChange={(e) => setMemoryKind(e.target.value as MemoryKind)} aria-label="记忆类型">
            <option value="name">名字</option><option value="preference">喜好</option>
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
        <div className="side-title">和{profileName || "妹妹"}出门</div>
        <div className="locked-hint">💭 {profileName || "妹妹"}今天想去：{wishedOuting.name} · 选中时好感 ×2</div>
        <div className="outings">
          {OUTINGS.map((outing) => {
            const locked = affinity < outing.minAffinity;
            return (
              <button
                key={outing.id}
                className="outing"
                disabled={locked || lastOutingDate === todayStr()}
                title={locked ? `亲密度 ${outing.minAffinity} 解锁` : `心情 +${outing.mood}`}
                onClick={() => {
                  const blocked = goOut(outing.id);
                  if (blocked) flash(blocked);
                }}
              >
                <span>{outing.emoji}</span>{outing.name}
                {locked && <small>❤{outing.minAffinity}</small>}
              </button>
            );
          })}
        </div>
        <div className="locked-hint">{lastOutingDate === todayStr() ? "今天已经出过门啦 ✓" : "每天可以一起出门一次"}</div>
      </div>

      <div className="side-block">
        <div className="side-title">送给{profileName || "妹妹"}的小礼物</div>
        <div className="gifts">
          {GIFTS.map((g) => (
            <button
              key={g.id}
              className="gift"
              title={`亲密度+${g.affinity} 心情+${g.mood}`}
              onClick={() => {
                void giveGift(g.id).then((blocked) => { if (blocked) flash(blocked); });
              }}
              disabled={(inventory[g.id] ?? 0) <= 0}
            >
              <span className="gift-emoji">{g.emoji}</span>
              <span className="gift-name">{g.name}</span>
              <span className="gift-count">×{inventory[g.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="locked-hint">每天最多送 3 份哦</div>
      </div>


      {toast && <div className="toast">{toast}</div>}
    </aside>
  );
}
