import { useState } from "react";
import { parseMessageSegments, type MessageSegment } from "@/lib/messageParser";

interface MessageSegmentViewProps {
  content: string;
  role: "user" | "assistant";
  companionName?: string;
  onSelectOption?: (option: string) => void;
  isLatestAssistantMessage?: boolean;
}

export function MessageSegmentView({
  content,
  role,
  companionName = "妹妹",
  onSelectOption,
  isLatestAssistantMessage = true,
}: MessageSegmentViewProps) {
  const [thinkOpen, setThinkOpen] = useState(false);

  if (role === "user") {
    return <div className="user-bubble-text">{content}</div>;
  }

  const segments: MessageSegment[] = parseMessageSegments(content);

  if (segments.length === 0) {
    return <>{content}</>;
  }

  return (
    <div className="message-segments-container">
      {segments.map((seg, idx) => {
        if (seg.type === "think") {
          return (
            <div key={`think-${idx}`} className="bubble-think-card">
              <button
                type="button"
                className="bubble-think-header"
                onClick={() => setThinkOpen(!thinkOpen)}
                aria-expanded={thinkOpen}
              >
                <span className="think-icon">💭</span>
                <span className="think-title">{companionName}的小心思</span>
                <span className="think-toggle">{thinkOpen ? "收起 ▲" : "展开 ▼"}</span>
              </button>
              {thinkOpen && (
                <div className="bubble-think-content">
                  {seg.content}
                </div>
              )}
            </div>
          );
        }

        if (seg.type === "action") {
          return (
            <div key={`act-${idx}`} className="bubble-action-tag">
              <span className="action-icon">🌸</span>
              <span className="action-text">{seg.content}</span>
            </div>
          );
        }

        if (seg.type === "scene") {
          return (
            <div key={`scene-${idx}`} className="bubble-scene-text">
              <span className="scene-indicator">▰ SCENE</span>
              <span className="scene-content">{seg.content}</span>
            </div>
          );
        }

        if (seg.type === "thought") {
          return (
            <div key={`thought-${idx}`} className="bubble-inner-thought">
              <span className="thought-badge">💭 心声</span>
              <span className="thought-text">{seg.content.replace(/^(心声|心想|内心|独白|OS)[：:]\s*/i, "")}</span>
            </div>
          );
        }

        if (seg.type === "options") {
          return (
            <div key={`opts-${idx}`} className="galgame-options-group">
              <div className="options-header">
                <span className="options-icon">🎮</span>
                <span>请选择你的回应分支：</span>
              </div>
              <div className="options-list">
                {seg.options.map((opt, optIdx) => (
                  <button
                    key={optIdx}
                    type="button"
                    className="galgame-option-btn"
                    onClick={() => onSelectOption?.(opt)}
                    disabled={!isLatestAssistantMessage}
                  >
                    <span className="option-num">0{optIdx + 1}</span>
                    <span className="option-text">{opt}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        }

        return (
          <div key={`dia-${idx}`} className="bubble-dialogue-text">
            {seg.content}
          </div>
        );
      })}
    </div>
  );
}
