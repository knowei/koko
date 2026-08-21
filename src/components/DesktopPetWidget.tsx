import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { useStore } from "@/store/companionStore";
import { Avatar } from "@/components/Avatar";
import { Live2DViewer } from "@/components/Live2DViewer";
import { screenVision, type VisionCommentResult } from "@/lib/visionPerception";
import { voiceRecognizer, isSTTSupported } from "@/lib/stt";

interface DesktopPetWidgetProps {
  onClose: () => void;
  isPipWindow?: boolean;
}

const TOUCH_REACTIONS = [
  { action: "pat", text: "（眯起眼睛蹭蹭你的手心）最喜欢哥哥摸摸头啦~", voice: "最喜欢哥哥摸摸头啦~", expr: "blush" },
  { action: "poke", text: "（鼓起腮帮子轻轻拍开）呜…干嘛突然戳人家脸蛋啦，会变胖的！", voice: "干嘛突然戳人家脸蛋啦，会变胖的！", expr: "pout" },
  { action: "hand", text: "（轻轻握住你的手）哥哥的手好温暖，可可一直陪着你哦。", voice: "哥哥的手好温暖，可可一直陪着你哦。", expr: "shy" },
];

export function DesktopPetWidget({ onClose, isPipWindow }: DesktopPetWidgetProps) {
  const profile = useStore((s) => s.profile);
  const activeSkin = useStore((s) => s.activeSkin);
  const mood = useStore((s) => s.mood);
  const affinity = useStore((s) => s.affinity);
  const provider = useStore((s) => s.provider);
  const ttsSettings = useStore((s) => s.ttsSettings);
  const setTtsSettings = useStore((s) => s.setTtsSettings);
  const speakDirectText = useStore((s) => s.speakDirectText);
  const send = useStore((s) => s.send);
  const messages = useStore((s) => s.messages);
  const streaming = useStore((s) => s.streaming);

  // States
  const [useLive2D, setUseLive2D] = useState(true);
  const [currentBubbleText, setCurrentBubbleText] = useState<string>(
    `（晃着小腿坐着）哥哥今天玩什么游戏或者在忙什么呀？可可在旁边陪着你哦~`
  );
  const [currentExpr, setCurrentExpr] = useState<"smile" | "blush" | "shy" | "pout" | "sleepy" | "surprised">("smile");
  const [isScreenSharing, setIsScreenSharing] = useState(screenVision.isSharing());
  const [isAutoPatrol, setIsAutoPatrol] = useState(screenVision.autoPatrolActive);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [dragPos, setDragPos] = useState({
    x: typeof window !== "undefined" ? Math.max(20, window.innerWidth - 280) : 20,
    y: typeof window !== "undefined" ? Math.max(20, window.innerHeight - 400) : 20,
  });
  const [isDragging, setIsDragging] = useState(false);
  const [petNotice, setPetNotice] = useState<string | null>(null);

  const dragStartRef = useRef({ startX: 0, startY: 0, posX: 0, posY: 0 });
  const hasDraggedRef = useRef(false);
  const bubbleTimeoutRef = useRef<number | null>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // Sync latest assistant message with speech bubble
  useEffect(() => {
    const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistantMsg && lastAssistantMsg.content) {
      setCurrentBubbleText(lastAssistantMsg.content);
    }
  }, [messages]);

  // Auto start lookScreen and auto-patrol in companion mode
  useEffect(() => {
    const isDesktop = typeof window !== "undefined" && Boolean(window.electronAPI?.isElectron);
    const initialTimer = window.setTimeout(() => {
      void handleLookScreen(true);
      if (isDesktop) {
        setIsAutoPatrol(true);
        const context = { profile, affinity, mood };
        screenVision.startAutoPatrol(
          20, // every 20 seconds
          (res) => {
            triggerBubbleSpeech(res.commentary, res.expression);
          },
          provider,
          context,
        );
      }
    }, 1800);

    return () => {
      window.clearTimeout(initialTimer);
      screenVision.stopAutoPatrol();
    };
  }, []);

  const triggerBubbleSpeech = (text: string, expr?: typeof currentExpr) => {
    setCurrentBubbleText(text);
    if (expr) setCurrentExpr(expr);

    // Speak with TTS if autoPlay is enabled
    if (ttsSettings.autoPlay) {
      // Clean brackets
      const cleanVoiceText = text.replace(/（[^）]*）|\([^)]*\)|【[^】]*】|\*[^*]*\*/g, "").trim() || text;
      void speakDirectText(cleanVoiceText);
    }

    if (bubbleTimeoutRef.current) {
      window.clearTimeout(bubbleTimeoutRef.current);
    }
    // Auto reset bubble text after 12s
    bubbleTimeoutRef.current = window.setTimeout(() => {
      // Keep idle text
    }, 12000);
  };

  // Touch character interactions
  const handleTouch = (type: "head" | "cheek" | "hand") => {
    if (hasDraggedRef.current) return;
    const idx = type === "head" ? 0 : type === "cheek" ? 1 : 2;
    const item = TOUCH_REACTIONS[idx];
    triggerBubbleSpeech(item.text, item.expr as any);
  };

  // Pop out to Native Desktop Always-On-Top Window (Document PiP)
  const handlePopOutDesktop = async () => {
    if (typeof window === "undefined" || !("documentPictureInPicture" in window)) {
      setPetNotice("当前浏览器不支持原生桌面小窗置顶弹出，推荐使用 Edge 或 Chrome 111+ 浏览器。");
      setTimeout(() => setPetNotice(null), 4000);
      return;
    }

    try {
      const pipWin = await (window as any).documentPictureInPicture.requestWindow({
        width: 290,
        height: 380,
      });

      // Copy all stylesheets from main window
      [...document.styleSheets].forEach((styleSheet) => {
        try {
          const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join("");
          const style = document.createElement("style");
          style.textContent = cssRules;
          pipWin.document.head.appendChild(style);
        } catch {
          const link = document.createElement("link");
          if (styleSheet.href) {
            link.rel = "stylesheet";
            link.type = styleSheet.type;
            link.media = styleSheet.media.toString();
            link.href = styleSheet.href;
            pipWin.document.head.appendChild(link);
          }
        }
      });

      // Render into PiP document
      const container = pipWin.document.createElement("div");
      container.id = "pip-pet-root";
      pipWin.document.body.appendChild(container);
      pipWin.document.body.style.margin = "0";
      pipWin.document.body.style.overflow = "hidden";
      pipWin.document.body.style.background = "transparent";

      onClose();

      const root = ReactDOM.createRoot(container);
      root.render(<DesktopPetWidget onClose={() => pipWin.close()} isPipWindow={true} />);

      pipWin.addEventListener("pagehide", () => {
        root.unmount();
      });
    } catch (e: any) {
      setPetNotice(e.message || "弹出桌面小窗失败");
      setTimeout(() => setPetNotice(null), 4000);
    }
  };

  // Toggle Screen / Game Share
  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      screenVision.stopScreenSharing();
      setIsScreenSharing(false);
      setIsAutoPatrol(false);
      triggerBubbleSpeech("（眨巴眼睛）屏幕观察已暂停，需要我再看时随时点我哦~", "smile");
    } else {
      try {
        setPetNotice("正在连接屏幕/游戏画面…");
        await screenVision.startScreenSharing();
        setIsScreenSharing(true);
        setPetNotice(null);
        triggerBubbleSpeech("（戴上小眼镜探头）我已经看到你的屏幕啦！正在全天候观察你的战况~", "surprised");
      } catch (e: any) {
        setPetNotice(e.message || "未能开启屏幕捕获");
        setTimeout(() => setPetNotice(null), 4000);
      }
    }
  };

  // Manual Screenshot Vision Comment
  const handleLookScreen = async (silent = false) => {
    if (!isScreenSharing && !window.electronAPI?.isElectron) {
      await handleToggleScreenShare();
      return;
    }

    setIsAnalyzing(true);
    if (!silent) {
      triggerBubbleSpeech("（眨巴着大眼睛仔细看着你的屏幕…）", "shy");
    }

    try {
      const context = { profile, affinity, mood };
      const result: VisionCommentResult = await screenVision.requestComment(provider, context, "auto");
      triggerBubbleSpeech(result.commentary, result.expression);
    } catch (e: any) {
      if (!silent) {
        triggerBubbleSpeech(`（揉揉眼睛）${e.message || "刚才画面没看清，再试一次吧~"}`, "surprised");
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Toggle Auto Patrol Cruise
  const handleToggleAutoPatrol = () => {
    if (!isScreenSharing && !window.electronAPI?.isElectron) {
      void handleToggleScreenShare();
      return;
    }

    if (isAutoPatrol) {
      screenVision.stopAutoPatrol();
      setIsAutoPatrol(false);
      triggerBubbleSpeech("（伸懒腰）自动巡航观察已暂停，需要我时随时点一下「看屏幕」哦~", "smile");
    } else {
      setIsAutoPatrol(true);
      const context = { profile, affinity, mood };
      screenVision.startAutoPatrol(
        20, // every 20 seconds
        (res) => {
          triggerBubbleSpeech(res.commentary, res.expression);
        },
        provider,
        context,
      );
      triggerBubbleSpeech("（开启专注陪伴）全天候屏幕陪伴中！每隔一会儿我就会主动看看战况为你加油~", "smile");
    }
  };

  // Voice intercom in Pet Widget
  const handleToggleVoice = () => {
    if (!isSTTSupported()) {
      setPetNotice("当前浏览器不支持语音输入");
      setTimeout(() => setPetNotice(null), 3000);
      return;
    }

    if (isRecording) {
      voiceRecognizer.stop();
      setIsRecording(false);
    } else {
      setIsRecording(true);
      triggerBubbleSpeech("（竖起小耳朵）正在倾听你说的话…", "shy");
      voiceRecognizer.start({
        onFinalText: (text) => {
          setIsRecording(false);
          if (text.trim()) {
            triggerBubbleSpeech(`（收到哥哥的话：“${text}”）思考中…`, "smile");
            void send(text.trim());
          }
        },
        onError: (err) => {
          setIsRecording(false);
          setPetNotice(err);
          setTimeout(() => setPetNotice(null), 4000);
        },
      });
    }
  };

  // Text message send handler in Pet Widget
  const handleSendText = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = textDraft.trim();
    if (!text || streaming) return;
    setTextDraft("");
    setShowTextInput(false);
    triggerBubbleSpeech(`（收到哥哥的话：“${text}”）思考中…`, "shy");
    await send(text);
  };

  // Dragging support (for in-page overlay)
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPipWindow) return;
    hasDraggedRef.current = false;
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: dragPos.x,
      posY: dragPos.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      hasDraggedRef.current = true;
    }
    setDragPos({
      x: Math.max(10, Math.min(window.innerWidth - 260, dragStartRef.current.posX + dx)),
      y: Math.max(10, Math.min(window.innerHeight - 340, dragStartRef.current.posY + dy)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  return (
    <div
      className={`desktop-pet-container ${isPipWindow ? "pip-mode" : "overlay-mode"}`}
      style={!isPipWindow ? { left: `${dragPos.x}px`, top: `${dragPos.y}px` } : undefined}
    >
      {/* Notice Alert */}
      {petNotice && <div className="pet-toast-alert">{petNotice}</div>}

      {/* Screen Observation Radar Scan HUD */}
      {isAnalyzing && (
        <div className="pet-scan-hud">
          <span className="scan-icon">👁️</span>
          <span>正在观察屏幕战况…</span>
        </div>
      )}

      {/* Floating Dialog Bubble */}
      <div className="pet-speech-bubble">
        <div className="pet-bubble-content">{currentBubbleText}</div>
        <div className="pet-bubble-tail" />
      </div>

      {/* Pet Character Body */}
      <div
        className="pet-character-wrap"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={() => {
          if (window.electronAPI) window.electronAPI.switchWindowMode("full");
        }}
        title="按住拖拽摆放，双击展开完整工作台"
      >
        <div className="pet-drag-handle" title="按住拖拽位置">
          ⠿
        </div>

        {/* Emotion Floating Badge */}
        <div className="pet-emotion-badge">
          {currentExpr === "blush" ? "🌸 脸红" : currentExpr === "pout" ? "💢 傲娇" : currentExpr === "surprised" ? "⚡ 惊讶" : currentExpr === "shy" ? "✨ 害羞" : "💖 开心"}
        </div>

        {/* Character Render (Live2D or 2D Avatar) */}
        {useLive2D ? (
          <Live2DViewer
            modelPath="/live2d/shizuku/shizuku.model.json"
            width={200}
            height={240}
            expression={currentExpr}
            onTapArea={(area) => {
              if (area === "head") handleTouch("head");
              else if (area === "face") handleTouch("cheek");
              else handleTouch("hand");
            }}
          />
        ) : (
          <>
            <div className="pet-touch-zones">
              <button
                type="button"
                className="touch-zone head-zone"
                onClick={() => handleTouch("head")}
                title="摸摸头"
              />
              <button
                type="button"
                className="touch-zone cheek-zone"
                onClick={() => handleTouch("cheek")}
                title="戳脸蛋"
              />
              <button
                type="button"
                className="touch-zone hand-zone"
                onClick={() => handleTouch("hand")}
                title="牵牵手"
              />
            </div>
            <div className="pet-sprite">
              <Avatar name={profile.name} skin={activeSkin} size={150} />
            </div>
          </>
        )}
      </div>

      {/* Mini Text Input Box */}
      {showTextInput && (
        <form className="pet-text-input-box" onSubmit={handleSendText}>
          <input
            ref={textInputRef}
            type="text"
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder={`跟${profile.name}说点什么…`}
            maxLength={120}
            autoFocus
          />
          <button type="submit" disabled={!textDraft.trim() || streaming} className="pet-input-send-btn">
            {streaming ? "…" : "发送"}
          </button>
          <button
            type="button"
            onClick={() => setShowTextInput(false)}
            className="pet-input-close-btn"
            title="关闭输入框"
          >
            ✕
          </button>
        </form>
      )}

      {/* Sleek Floating Capsule Controls Dock */}
      <div className="pet-controls-bar">
        {window.electronAPI?.isElectron ? (
          <button
            type="button"
            className="pet-ctrl-btn expand-btn"
            onClick={() => window.electronAPI?.switchWindowMode("full")}
            title="展开为完整伴侣工作台"
          >
            <span>⛶</span>
            <span className="btn-label">工作台</span>
          </button>
        ) : !isPipWindow ? (
          <button
            type="button"
            className="pet-ctrl-btn pip-btn"
            onClick={handlePopOutDesktop}
            title="弹出为独立置顶桌面小窗"
          >
            <span>🪟</span>
            <span className="btn-label">小窗</span>
          </button>
        ) : null}

        <button
          type="button"
          className={`pet-ctrl-btn chat-btn ${showTextInput ? "active" : ""}`}
          onClick={() => {
            setShowTextInput(!showTextInput);
            setTimeout(() => textInputRef.current?.focus(), 100);
          }}
          title={showTextInput ? "收起文字输入" : "打字聊天（输入文字与可可对话）"}
        >
          <span>💬</span>
          <span className="btn-label">打字</span>
        </button>

        <button
          type="button"
          className={`pet-ctrl-btn voice-btn ${isRecording ? "recording" : ""}`}
          onClick={handleToggleVoice}
          title={isRecording ? "点击停止对讲" : "语音对讲（说出你想对妹妹说的话）"}
        >
          <span>🎙️</span>
          <span className="btn-label">对讲</span>
        </button>

        <button
          type="button"
          className={`pet-ctrl-btn look-btn ${isAnalyzing ? "loading" : ""}`}
          onClick={() => handleLookScreen(false)}
          title="立即观察当前屏幕/游戏战况"
        >
          <span>👁️</span>
          <span className="btn-label">{isAnalyzing ? "观察中" : "看屏幕"}</span>
        </button>

        <button
          type="button"
          className={`pet-ctrl-btn cruise-btn ${isAutoPatrol ? "active" : ""}`}
          onClick={handleToggleAutoPatrol}
          title={isAutoPatrol ? "自动巡航观察中（每隔20秒主动看屏幕）" : "点击开启自动巡航观察"}
        >
          <span>⏱️</span>
          {isAutoPatrol && <span className="cruise-pulse-dot" />}
          <span className="btn-label">{isAutoPatrol ? "巡航中" : "巡航"}</span>
        </button>

        <button
          type="button"
          className={`pet-ctrl-btn mode-toggle-btn ${useLive2D ? "live2d" : ""}`}
          onClick={() => {
            const next = !useLive2D;
            setUseLive2D(next);
            triggerBubbleSpeech(next ? "（眨眨眼）切换为 Live2D 动态模型啦！" : "切换回原版 2D 立绘啦~", "smile");
          }}
          title={useLive2D ? "当前：Live2D（点击切回 2D 立绘）" : "当前：2D 立绘（点击切为 Live2D）"}
        >
          <span>{useLive2D ? "🎭" : "🖼️"}</span>
          <span className="btn-label">{useLive2D ? "Live2D" : "2D"}</span>
        </button>

        <button
          type="button"
          className={`pet-ctrl-btn tts-btn ${ttsSettings.autoPlay ? "active" : ""}`}
          onClick={() => setTtsSettings({ autoPlay: !ttsSettings.autoPlay })}
          title={ttsSettings.autoPlay ? "语音播报：已开启" : "语音播报：已关闭"}
        >
          <span>{ttsSettings.autoPlay ? "🔊" : "🔇"}</span>
          <span className="btn-label">语音</span>
        </button>

        {window.electronAPI?.isElectron ? (
          <button
            type="button"
            className="pet-ctrl-btn close-btn"
            onClick={() => window.electronAPI?.close()}
            title="退出可可陪伴"
          >
            <span>✕</span>
          </button>
        ) : !isPipWindow ? (
          <button
            type="button"
            className="pet-ctrl-btn close-btn"
            onClick={onClose}
            title="关闭悬浮模式，返回主界面"
          >
            <span>✕</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
