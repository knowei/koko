import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store/companionStore";
import { generateSuggestions } from "@/lib/suggestions";
import { MessageSegmentView } from "@/components/MessageSegmentView";
import { voiceRecognizer, isSTTSupported } from "@/lib/stt";

interface ChatScreenProps {
  onOpenGames?: () => void;
  onOpenFocus?: () => void;
  onOpenLife?: () => void;
  onOpenSticky?: () => void;
  onOpenLorebook?: () => void;
}

export function ChatScreen({
  onOpenGames,
  onOpenFocus,
  onOpenLife,
  onOpenSticky,
  onOpenLorebook,
}: ChatScreenProps = {}) {
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

  // STT Voice Recording States
  const [recordingMode, setRecordingMode] = useState<"hold" | "click" | null>(null);
  const [recordedText, setRecordedText] = useState("");
  const [isCanceling, setIsCanceling] = useState(false);
  const [sttNotice, setSttNotice] = useState<string | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const startYRef = useRef<number>(0);
  const isHoldingRef = useRef(false);
  const latestRecordedTextRef = useRef("");

  const ttsSettings = useStore((s) => s.ttsSettings);
  const setTtsSettings = useStore((s) => s.setTtsSettings);
  const currentlySpeakingId = useStore((s) => s.currentlySpeakingId);
  const playMessageAudio = useStore((s) => s.playMessageAudio);
  const stopAudio = useStore((s) => s.stopAudio);
  const personalityToast = useStore((s) => s.personalityToast);
  const setPersonalityToast = useStore((s) => s.setPersonalityToast);

  useEffect(() => {
    if (personalityToast) {
      const timer = setTimeout(() => {
        setPersonalityToast(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [personalityToast, setPersonalityToast]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submit = () => {
    const text = draft;
    setDraft("");
    setShowActions(false);
    void send(text);
  };

  const handleMicPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (streaming) return;
    if (!isSTTSupported()) {
      setSttNotice("当前浏览器不支持原生语音识别，推荐使用 Chrome、Edge 或 Safari 浏览器。");
      setTimeout(() => setSttNotice(null), 4000);
      return;
    }

    // If currently in click-recording mode, clicking again stops it
    if (recordingMode === "click") {
      voiceRecognizer.stop();
      setRecordingMode(null);
      return;
    }

    startYRef.current = e.clientY;
    isHoldingRef.current = false;
    latestRecordedTextRef.current = "";

    // Timer to differentiate click vs long-press hold
    holdTimerRef.current = window.setTimeout(() => {
      isHoldingRef.current = true;
      setRecordingMode("hold");
      setIsCanceling(false);
      setRecordedText("");
      voiceRecognizer.start({
        onInterimText: (t) => {
          setRecordedText(t);
          latestRecordedTextRef.current = t;
        },
        onError: (msg) => {
          setSttNotice(msg);
          setRecordingMode(null);
          setTimeout(() => setSttNotice(null), 4000);
        },
      });
    }, 220);
  };

  const handleMicPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isHoldingRef.current && recordingMode === "hold") {
      const diff = startYRef.current - e.clientY;
      setIsCanceling(diff > 55);
    }
  };

  const handleMicPointerUp = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    if (isHoldingRef.current && recordingMode === "hold") {
      isHoldingRef.current = false;
      const willCancel = isCanceling;
      const text = latestRecordedTextRef.current.trim();
      voiceRecognizer.stop();
      setRecordingMode(null);
      setRecordedText("");
      setIsCanceling(false);

      if (!willCancel && text) {
        void send(text);
      }
    } else if (!isHoldingRef.current && recordingMode !== "click") {
      // Single click triggered -> continuous click dictation
      setRecordingMode("click");
      voiceRecognizer.start({
        onInterimText: (t) => {
          setDraft(t);
        },
        onEnd: () => {
          setRecordingMode(null);
        },
        onError: (msg) => {
          setSttNotice(msg);
          setRecordingMode(null);
          setTimeout(() => setSttNotice(null), 4000);
        },
      });
    }
  };

  const handleMicPointerCancel = () => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (recordingMode === "hold") {
      voiceRecognizer.cancel();
      setRecordingMode(null);
      setRecordedText("");
      setIsCanceling(false);
    }
  };

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant" && m.content.trim())?.content || "";
  const suggestions = generateSuggestions(lastAssistantMsg, profile, mood, affinity);

  return (
    <section className="chat">
      {personalityToast && (
        <div className="personality-toast-banner" role="status">
          <span>{personalityToast}</span>
          <button onClick={() => setPersonalityToast(null)} title="关闭提示">✕</button>
        </div>
      )}

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

      {/* STT / Voice Notice */}
      {sttNotice && (
        <div className="stt-notice-toast" onClick={() => setSttNotice(null)}>
          🎙️ {sttNotice}
        </div>
      )}

      {/* Hold-to-talk full intercom HUD */}
      {recordingMode === "hold" && (
        <div className={`hold-intercom-hud ${isCanceling ? "canceling" : ""}`}>
          <div className="intercom-anim-wave">
            <span /><span /><span /><span /><span />
          </div>
          <div className="intercom-text">
            {isCanceling ? "松开手指，取消发送" : (recordedText ? `“${recordedText}”` : "正在倾听你的声音…")}
          </div>
          <div className="intercom-hint">
            {isCanceling ? "⚠️ 松开将取消发送" : "↑ 上滑取消 · 松开立即发送"}
          </div>
        </div>
      )}

      <div className="composer">
        <div className="action-popover-wrapper">
          <button
            type="button"
            className={`action-popover-btn ${showActions ? "active" : ""}`}
            onClick={() => setShowActions(!showActions)}
            title={`和${profile.name || "妹妹"}的互动动作`}
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
              {onOpenFocus && (
                <button disabled={streaming} onClick={() => { setShowActions(false); onOpenFocus(); }}>
                  🍅 开启专注伴读
                </button>
              )}
              {onOpenLife && (
                <button disabled={streaming} onClick={() => { setShowActions(false); onOpenLife(); }}>
                  💧 喝水打卡与作息
                </button>
              )}
              {onOpenSticky && (
                <button disabled={streaming} onClick={() => { setShowActions(false); onOpenSticky(); }}>
                  📌 随手便签与待办
                </button>
              )}
              {onOpenGames && (
                <button
                  disabled={streaming}
                  onClick={() => {
                    setShowActions(false);
                    onOpenGames();
                  }}
                >
                  🎮 双人娱乐坊
                </button>
              )}
              {onOpenLorebook && (
                <button
                  disabled={streaming}
                  onClick={() => {
                    setShowActions(false);
                    onOpenLorebook();
                  }}
                >
                  📖 专属世界书
                </button>
              )}
              <button
                type="button"
                className="mobile-composer-tool"
                disabled={streaming}
                onPointerDown={handleMicPointerDown}
                onPointerMove={handleMicPointerMove}
                onPointerUp={handleMicPointerUp}
                onPointerCancel={handleMicPointerCancel}
              >
                {recordingMode === "click" ? "⏹ 停止语音输入" : "🎙️ 语音输入"}
              </button>
              <button
                type="button"
                className="mobile-composer-tool"
                onClick={() => setTtsSettings({ autoPlay: !ttsSettings.autoPlay })}
              >
                {ttsSettings.autoPlay ? "🔊 关闭自动朗读" : "🔇 开启自动朗读"}
              </button>
            </div>
          )}
        </div>

        <textarea
          value={draft}
          placeholder={recordingMode === "click" ? "正在聆听…" : ""}
          onChange={(e) => {
            setDraft(e.target.value);
            if (showActions) setShowActions(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              if ((e.nativeEvent as any).isComposing) return;
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
        />

        <button
          type="button"
          className={`voice-record-btn ${recordingMode ? "recording" : ""}`}
          onPointerDown={handleMicPointerDown}
          onPointerMove={handleMicPointerMove}
          onPointerUp={handleMicPointerUp}
          onPointerCancel={handleMicPointerCancel}
          title={recordingMode === "click" ? "点击停止语音转文字" : "语音对讲（长按对讲立即发送 / 单击开启连续语音转文字）"}
        >
          {recordingMode === "click" ? (
            <span className="mic-recording-dot">🔴</span>
          ) : (
            <span>🎙️</span>
          )}
        </button>

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


