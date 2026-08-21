import { useState } from "react";
import { useStore } from "@/store/companionStore";

export function RandomEventModal() {
  const event = useStore((state) => state.pendingEvent);
  const chooseEvent = useStore((state) => state.chooseEvent);
  const dismissEvent = useStore((state) => state.dismissEvent);
  const companionName = useStore((state) => state.profile.name) || "妹妹";
  const [notice, setNotice] = useState<string | null>(null);
  if (!event) return null;
  const loggedIn = Boolean(localStorage.getItem("koko-account-token"));

  const formatText = (text: string) => text.replace(/可可/g, companionName);

  return (
    <div className="modal-mask event-mask">
      <section className="modal event-modal" aria-labelledby="random-event-title">
        <button className="event-close" type="button" onClick={dismissEvent} aria-label="稍后处理随机事件">×</button>
        <div className="event-emoji">{event.emoji}</div>
        <div className="modal-title" id="random-event-title">随机事件 · {event.title}</div>
        <p className="event-description">{formatText(event.description)}</p>
        <div className="event-choices">
          {event.choices.map((choice) => (
            <button key={choice.id} disabled={!loggedIn} onClick={() => void chooseEvent(choice.id).then(setNotice)}>
              <strong>{formatText(choice.label)}</strong>
              <span>亲密度 +{choice.affinity} · 心情 +{choice.mood} · 随机心愿星</span>
            </button>
          ))}
        </div>
        {!loggedIn && <div className="fld-note event-login-note">登录后才能领取事件奖励；你可以先关闭事件，继续正常聊天。</div>}
        {notice && <div className="fld-note err">{notice}</div>}
        <button className="event-later" type="button" onClick={dismissEvent}>{loggedIn ? "稍后再说" : "关闭事件"}</button>
      </section>
    </div>
  );
}
