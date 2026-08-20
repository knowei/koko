import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/companionStore";
import { generateSuggestions } from "@/lib/suggestions";
import { MessageSegmentView } from "@/components/MessageSegmentView";

export function ChatScreen() {
  const messages = useStore((s) => s.messages);
  const streaming = useStore((s) => s.streaming);
  const error = useStore((s) => s.error);
  const send = useStore((s) => s.send);
  const quickAction = useStore((s) => s.quickAction);
  const clearError = useStore((s) => s.clearError);
  const profile = useStore((s) => s.profile);
  const mood = useStore((s) => s.mood);
  const affinity = useStore((s) => s.affinity);
  const [draft, setDraft] = useState("");
  const [showActions, setShowActions] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const ttsSettings = useStore((s) => s.ttsSettings);
  const setTtsSettings = useStore((s) => s.setTtsSettings);
  const currentlySpeakingId = useStore((s) => s.currentlySpeakingId);
  const playMessageAudio = useStore((s) => s.playMessageAudio);
  const stopAudio = useStore((s) => s.stopAudio);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    const text = draft;
    setDraft("");
    setShowActions(false);
    void send(text);
  };

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim())?.content || "";
  const suggestions = generateSuggestions(lastAssistantMsg, profile, mood, affinity);

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
                <div className="bubble-content">
                  {m.content ? (
                    <MessageSegmentView
                      content={m.content}
                      role={m.role}
                      companionName={profile.name}
                    />
                  ) : streaming ? (
                    <span className="typing">{profile.name}正在思考并打字…</span>
                  ) : (
                    ""
                  )}
                </div>
                {m.role === "assistant" && m.content && !streaming && (
                  <div className="bubble-footer">
                    <button
                      type="button"
                      className={`tts-msg-btn ${currentlySpeakingId === m.id ? "playing" : ""}`}
                      onClick={() => {
                        if (currentlySpeakingId === m.id) {
                          stopAudio();
                        } else {
                          void playMessageAudio(m.id);
                        }
                      }}
                      title={currentlySpeakingId === m.id ? "停止播放" : "语音朗读"}
                    >
                      {currentlySpeakingId === m.id ? (
                        <>
                          <span className="sound-wave">
                            <span /><span /><span />
                          </span>
                          <span>停止</span>
                        </>
                      ) : (
                        <>
                          <span>🔊</span>
                          <span>朗读</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
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

      {/* Dynamic single-row compact suggestions */}
      {!draft.trim() && !streaming && suggestions.length > 0 && (
        <div className="dynamic-suggestions-bar" aria-label="推荐回复">
          <span className="suggestion-icon" title="根据刚才的回复智能推荐">💡</span>
          {suggestions.map((text, idx) => (
            <button
              key={idx}
              className="suggestion-pill"
              type="button"
              onClick={() => void send(text)}
              title={`点击发送：“${text}”`}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      <div className="composer">
        <div className="action-popover-wrapper">
          <button
            type="button"
            className={`action-popover-btn ${showActions ? "active" : ""}`}
            onClick={() => setShowActions(!showActions)}
            title={`和${profile.name}的互动动作`}
          >
            💖
          </button>
          {showActions && (
            <div className="action-popover-menu">
              <button disabled={streaming} onClick={() => { setShowActions(false); void quickAction("pat"); }}>
                🌸 摸摸头
              </button>
              <button disabled={streaming} onClick={() => { setShowActions(false); void quickAction("water"); }}>
                🥛 递温水
              </button>
              <button disabled={streaming} onClick={() => { setShowActions(false); void quickAction("praise"); }}>
                ✨ 夸夸她
              </button>
              <button disabled={streaming} onClick={() => { setShowActions(false); void quickAction("miss"); }}>
                💖 抱抱她
              </button>
            </div>
          )}
        </div>

        <textarea
          value={draft}
          placeholder={`跟${profile.name}说点什么…`}
          onChange={(e) => {
            setDraft(e.target.value);
            if (showActions) setShowActions(false);
          }}
          rows={1}
        />

        <button
          type="button"
          className={`quick-tts-icon-btn ${ttsSettings.autoPlay ? "active" : ""}`}
          onClick={() => setTtsSettings({ autoPlay: !ttsSettings.autoPlay })}
          title={ttsSettings.autoPlay ? "自动语音播报：已开启（点击关闭）" : "自动语音播报：已关闭（点击开启）"}
        >
          {ttsSettings.autoPlay ? "🔊" : "🔇"}
        </button>

        <button className="send-btn" disabled={streaming || !draft.trim()} onClick={submit}>
          {streaming ? "…" : "发送"}
        </button>
      </div>
    </section>
  );
}


