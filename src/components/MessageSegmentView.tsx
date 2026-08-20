import { useState } from "react";
import { parseMessageSegments, type MessageSegment } from "@/lib/messageParser";

interface MessageSegmentViewProps {
  content: string;
  role: "user" | "assistant";
  companionName?: string;
}

export function MessageSegmentView({
  content,
  role,
  companionName = "妹妹",
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

        return (
          <div key={`dia-${idx}`} className="bubble-dialogue-text">
            {seg.content}
          </div>
        );
      })}
    </div>
  );
}
