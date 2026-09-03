import { useState, useRef, useEffect } from "react";
import { useStore } from "@/store/companionStore";
import { INDOOR_VENUES, type IndoorVenue, type VenueArea, type VenueAction } from "@/data/indoorVenues";

interface Props {
  venueId: string;
  onExit: () => void;
}

export function IndoorVenueSandbox({ venueId, onExit }: Props) {
  const venue: IndoorVenue = INDOOR_VENUES[venueId] || {
    id: venueId,
    name: "未知地点",
    emoji: "📍",
    themeColor: "#3b82f6",
    headerTagline: "探索城市中的未知角落",
    areas: [],
  };

  const [activeAreaId, setActiveAreaId] = useState<string>(
    venue.areas[0]?.id || "default"
  );
  const [activeResult, setActiveResult] = useState<{
    action: VenueAction;
    title: string;
    dialogue: string;
    thought: string;
    actionTag: string;
    affinityReward: number;
    moodReward: number;
    pointsReward: number;
  } | null>(null);

  // Cinema special movie choice state
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);

  // In-area live chat state
  const [inputText, setInputText] = useState("");
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const profile = useStore((s) => s.profile);
  const activeSkin = useStore((s) => s.activeSkin);
  const companionName = profile.name || "妹妹";
  const messages = useStore((s) => s.messages);
  const streaming = useStore((s) => s.streaming);
  const sendMessage = useStore((s) => s.send);
  const executeVenueAction = useStore((s) => s.executeVenueAction);

  const skinSuffix = activeSkin === "green" ? "-green" : "";
  const kokoPortraitUrl = `./assets/character/koko-base${skinSuffix}.png`;

  const currentArea: VenueArea | undefined =
    venue.areas.find((a) => a.id === activeAreaId) || venue.areas[0];

  // Auto-scroll chat
  useEffect(() => {
    if (chatExpanded) {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatExpanded]);

  const handleSelectArea = (areaId: string) => {
    setActiveAreaId(areaId);
    setActiveResult(null);
  };

  const handleTriggerAction = async (action: VenueAction) => {
    if (!currentArea) return;
    const res = await executeVenueAction(venue.id, currentArea.id, action.id);
    if (res) {
      setActiveResult({
        action,
        title: res.title,
        dialogue: res.dialogue,
        thought: res.thought,
        actionTag: res.action,
        affinityReward: res.affinityReward,
        moodReward: res.moodReward,
        pointsReward: res.pointsReward,
      });
    }
  };

  const handleSendAreaChat = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || streaming) return;
    setInputText("");
    sendMessage(text);
  };

  const recentAreaMessages = messages
    .filter((m) => m.kind === "chat" || m.kind === "event")
    .slice(-6);

  const selectedMovie = venue.movies?.find((m) => m.id === selectedMovieId);

  return (
    <div className="venue-sandbox-overlay" role="dialog" aria-modal="true" aria-label={venue.name}>
      <div className="venue-sandbox-card">
        {/* 1. Header Toolbar */}
        <header className="venue-sandbox-header" style={{ borderColor: venue.themeColor }}>
          <div className="venue-header-info">
            <span className="venue-header-emoji">{venue.emoji}</span>
            <div className="venue-header-text">
              <div className="venue-header-title-row">
                <h2 className="venue-header-title">{venue.name}</h2>
                <span className="venue-live-status-tag">探索中</span>
              </div>
              <small className="venue-header-desc">{venue.headerTagline}</small>
            </div>
          </div>

          <button
            className="venue-exit-btn"
            onClick={onExit}
            title="推门回到街头大地图（可可依然留在门前）"
          >
            <span className="exit-icon">🚪</span>
            <span>推门回街头</span>
          </button>
        </header>

        {/* 2. Venue Sub-Area Tabs (自由漫步穿梭区域) */}
        {venue.areas.length > 1 && (
          <nav className="venue-areas-nav" aria-label="场所内区域导航">
            <div className="areas-nav-label">
              <span>探索区域：</span>
            </div>
            <div className="areas-nav-scroll">
              {venue.areas.map((area) => {
                const isActive = area.id === activeAreaId;
                return (
                  <button
                    key={area.id}
                    className={`area-nav-pill ${isActive ? "active" : ""}`}
                    onClick={() => handleSelectArea(area.id)}
                    style={isActive ? { borderColor: venue.themeColor, backgroundColor: `${venue.themeColor}15`, color: venue.themeColor } : {}}
                  >
                    <span className="area-pill-emoji">{area.emoji}</span>
                    <span className="area-pill-name">{area.name}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}

        {/* 3. Main Area Canvas & Actions */}
        <main className="venue-area-body">
          {currentArea && (
            <section className="area-ambient-banner">
              <div className="ambient-meta">
                <span className="ambient-badge">📍 当前区域 · {currentArea.name}</span>
                <p className="ambient-desc">{currentArea.description}</p>
                <div className="ambient-atmosphere-tag">
                  <span>💡 氛围：{currentArea.tagline}</span>
                </div>
              </div>
            </section>
          )}

          {/* Special Cinema Feature: Movie Selection Posters */}
          {venue.id === "cinema" && currentArea?.id === "hall_tickets" && venue.movies && (
            <section className="cinema-movies-deck">
              <div className="cinema-deck-title">
                <span>🎬 今日院线排片（点击海报可选择观影）：</span>
              </div>
              <div className="movies-grid">
                {venue.movies.map((m) => {
                  const isChosen = selectedMovieId === m.id;
                  return (
                    <div
                      key={m.id}
                      className={`movie-card-item ${isChosen ? "chosen" : ""}`}
                      onClick={() => setSelectedMovieId(m.id)}
                    >
                      <div className="movie-poster-header">
                        <span className="movie-poster-emoji">{m.posterEmoji}</span>
                        <div className="movie-meta-right">
                          <strong className="movie-title">{m.title}</strong>
                          <small className="movie-genre">{m.genre} · {m.duration}</small>
                        </div>
                      </div>
                      <p className="movie-summary">{m.summary}</p>
                      <button className={`movie-pick-btn ${isChosen ? "picked" : ""}`}>
                        {isChosen ? "✓ 已选此部电影" : "选择看这部"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Movie Pick Feedback Card */}
              {selectedMovie && (
                <div className="movie-reaction-bubble animate-fade-in">
                  <div className="bubble-koko-avatar">
                    <img src={kokoPortraitUrl} alt={companionName} />
                  </div>
                  <div className="bubble-koko-content">
                    <div className="bubble-dialogue">{selectedMovie.reaction}</div>
                    <div className="bubble-thought">{selectedMovie.thought}</div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Active Action Result Card (Dialogue + Action Tag + Inner Thought) */}
          {activeResult ? (
            <div className="area-action-result-box animate-fade-in">
              <div className="result-koko-speaker-row">
                <div className="result-avatar-frame">
                  <img src={kokoPortraitUrl} alt={companionName} />
                </div>
                <div className="result-speaker-meta">
                  <strong>{companionName}</strong>
                  <span className="result-action-badge">（{activeResult.actionTag}）</span>
                </div>
              </div>

              <blockquote className="result-dialogue-content">
                <p>{activeResult.dialogue}</p>
              </blockquote>

              <div className="result-inner-thought-card">
                <span className="thought-label">💭 反差心声</span>
                <p className="thought-body">{activeResult.thought.replace(/^心声[：:]\s*/, "")}</p>
              </div>

              <div className="result-footer-bar">
                <div className="result-rewards-pill">
                  <span>❤ 亲密 +{activeResult.affinityReward}</span>
                  <span>😊 心情 +{activeResult.moodReward}</span>
                  <span>✦ 心愿星 +{activeResult.pointsReward}</span>
                </div>
                <button
                  className="result-dismiss-btn"
                  onClick={() => setActiveResult(null)}
                >
                  继续在这逛逛 ➔
                </button>
              </div>
            </div>
          ) : (
            /* Action Choices List in Current Area */
            currentArea && (
              <div className="area-actions-deck">
                <div className="actions-deck-title">
                  <span>✨ 在【{currentArea.name}】你可以自由选择行动：</span>
                </div>
                <div className="actions-buttons-list">
                  {currentArea.actions.map((act, i) => (
                    <button
                      key={act.id}
                      className="area-action-btn"
                      onClick={() => void handleTriggerAction(act)}
                    >
                      <div className="action-btn-left">
                        <span className="action-number">0{i + 1}</span>
                        <div className="action-label-wrap">
                          <strong className="action-main-label">{act.label}</strong>
                          <span className="action-sub-tagline">{act.tagline}</span>
                        </div>
                      </div>
                      <div className="action-btn-right">
                        <span className="action-reward-badge">❤+{act.affinityReward}</span>
                        <span className="action-arrow-icon">➔</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
        </main>

        {/* 4. In-Area Live Whispering Deck (区域内随时轻声耳语闲聊) */}
        <footer className="venue-live-chat-deck">
          {chatExpanded && (
            <div className="venue-chat-history animate-fade-in">
              {recentAreaMessages.length === 0 && (
                <div className="empty-area-chat-hint">
                  你们正呆在【{currentArea?.name}】里，这里微风与氛围正好……说句悄悄话问问她吧~
                </div>
              )}
              {recentAreaMessages.map((msg) => (
                <div key={msg.id} className={`area-bubble-row ${msg.role === "user" ? "user" : "assistant"}`}>
                  <div className="area-bubble-text">{msg.content}</div>
                </div>
              ))}
              {streaming && (
                <div className="area-bubble-row assistant streaming">
                  <div className="area-bubble-text">
                    <span>可可正在轻声组织语言……</span>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
          )}

          <div className="venue-chat-input-bar">
            <button
              type="button"
              className={`venue-chat-toggle-btn ${chatExpanded ? "active" : ""}`}
              onClick={() => setChatExpanded(!chatExpanded)}
              title={chatExpanded ? "收起悄悄话记录" : "展开在此处的悄悄话"}
            >
              <span>💬</span>
              <span>{chatExpanded ? "收起" : "悄悄话"}</span>
            </button>

            <form className="venue-input-form" onSubmit={handleSendAreaChat}>
              <input
                type="text"
                className="venue-chat-input"
                placeholder={`在【${currentArea?.name}】和${companionName}轻声说点什么…`}
                value={inputText}
                maxLength={100}
                onChange={(e) => setInputText(e.target.value)}
                onFocus={() => setChatExpanded(true)}
              />
              <button
                type="submit"
                className="venue-send-btn"
                disabled={!inputText.trim() || streaming}
              >
                耳语
              </button>
            </form>
          </div>
        </footer>
      </div>
    </div>
  );
}
