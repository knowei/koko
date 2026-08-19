import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/companionStore";

export function ChatScreen() {
  const messages = useStore((s) => s.messages);
  const streaming = useStore((s) => s.streaming);
  const error = useStore((s) => s.error);
  const send = useStore((s) => s.send);
  const clearError = useStore((s) => s.clearError);
  const [draft, setDraft] = useState("");
  const profile = useStore((s) => s.profile);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    const text = draft;
    setDraft("");
    void send(text);
  };

  return (
    <section className="chat">
      <div className="msg-list">
        {messages.length === 0 && (
          <div className="hint-bubble">
            我是{profile.name}，和你一起长大的妹妹~ 可以直接跟我说话，也可以到「陪伴」里签到、送礼物或一起出门。
          </div>
        )}
        {messages.map((m) => (
          m.kind === "hidden" ? null : m.kind === "event" ? (
            <div key={m.id} className="event-line">
              · {m.content} ·
            </div>
          ) : m.kind === "milestone" ? (
            <div key={m.id} className="milestone-card"><strong>🎀 关系里程碑</strong><p>{m.content}</p></div>
          ) : m.kind === "experience" ? (
            <div key={m.id} className="experience-chat-card"><strong>共同经历</strong><p>{m.content}</p></div>
          ) : (
            <div key={m.id} className={`row ${m.role}`}>
              <div className={`bubble ${m.role}`}>
                {m.content || (streaming ? <span className="typing">{profile.name}正在打字…</span> : "")}
              </div>
            </div>
          )
        ))}
        <div ref={endRef} />
      </div>

      {error && (
        <div className="err-bar" onClick={clearError}>
          ⚠ {error}（点此关闭）
        </div>
      )}

      <div className="composer">
        <textarea
          value={draft}
          placeholder={`跟${profile.name}说点什么…（Enter 发送 / Shift+Enter 换行）`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
        />
        <button className="send-btn" disabled={streaming || !draft.trim()} onClick={submit}>
          {streaming ? "…" : "发送"}
        </button>
      </div>
    </section>
  );
}
