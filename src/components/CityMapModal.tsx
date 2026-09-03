import { useState, useRef, useEffect } from "react";
import { useStore } from "@/store/companionStore";
import { preferredOuting } from "@/store/companionStore";
import { CITY_LOCATIONS, type CityMapLocation } from "@/data/cityMap";
import { IndoorVenueSandbox } from "@/components/IndoorVenueSandbox";

export function CityMapModal({ onClose }: { onClose?: () => void }) {
  const affinity = useStore((s) => s.affinity);
  const points = useStore((s) => s.points);
  const profile = useStore((s) => s.profile);
  const activeSkin = useStore((s) => s.activeSkin);
  const companionName = profile.name || "妹妹";

  const currentLocId = useStore((s) => s.currentOutingLocationId || "school");
  const isOutingMapActive = useStore((s) => s.isOutingMapActive);
  const enterOutingMap = useStore((s) => s.enterOutingMap);
  const leaveOutingMap = useStore((s) => s.leaveOutingMap);
  const moveToMapLocation = useStore((s) => s.moveToMapLocation);
  const outingStepCount = useStore((s) => s.outingStepCount);

  // Chat integration
  const messages = useStore((s) => s.messages);
  const streaming = useStore((s) => s.streaming);
  const sendChatMessage = useStore((s) => s.send);
  const [inputText, setInputText] = useState("");
  const [chatExpanded, setChatExpanded] = useState(false);

  // Active indoor venue exploration sandbox overlay
  const [indoorLocation, setIndoorLocation] = useState<CityMapLocation | null>(null);

  // Footstep animation state
  const [isWalking, setIsWalking] = useState(false);
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const wishedOuting = preferredOuting(affinity, companionName);
  const currentLocation = CITY_LOCATIONS.find((l) => l.id === currentLocId) || CITY_LOCATIONS[0];

  const skinSuffix = activeSkin === "green" ? "-green" : "";
  const kokoPortraitUrl = `./assets/character/koko-base${skinSuffix}.png`;

  useEffect(() => {
    if (!isOutingMapActive) {
      enterOutingMap(currentLocId);
    }
  }, [isOutingMapActive, currentLocId, enterOutingMap]);

  // Center camera on Koko
  const handleFocusKoko = () => {
    if (!mapViewportRef.current) return;
    const vp = mapViewportRef.current;
    const targetX = (currentLocation.x / 100) * 1000 - vp.clientWidth / 2;
    const targetY = (currentLocation.y / 100) * 680 - vp.clientHeight / 2;
    vp.scrollTo({ left: Math.max(0, targetX), top: Math.max(0, targetY), behavior: "smooth" });
  };

  useEffect(() => {
    // Center camera on initial load
    const timer = setTimeout(handleFocusKoko, 150);
    return () => clearTimeout(timer);
  }, [currentLocId]);

  // Scroll chat messages to bottom
  useEffect(() => {
    if (chatExpanded) {
      chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, chatExpanded]);

  // Handle walking to location
  const handleSelectLocation = (loc: CityMapLocation) => {
    if (affinity < loc.minAffinity) return;
    if (loc.id === currentLocId) {
      // Already there, open indoor venue sandbox
      setIndoorLocation(loc);
      return;
    }
    setIsWalking(true);
    moveToMapLocation(loc.id);
    setTimeout(() => {
      setIsWalking(false);
    }, 700);
  };

  const handleOpenIndoor = (loc: CityMapLocation) => {
    setIndoorLocation(loc);
  };

  const handleLeaveOuting = () => {
    leaveOutingMap();
    if (onClose) onClose();
  };

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || streaming) return;
    setInputText("");
    sendChatMessage(text);
  };

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (indoorLocation) {
          setIndoorLocation(null);
        } else if (onClose) {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [indoorLocation, onClose]);

  // Filter last 6 relevant messages for walking chat drawer
  const recentWalkingMessages = messages
    .filter((m) => m.kind === "chat" || m.kind === "event")
    .slice(-6);

  return (
    <div
      className="city-map-modal-mask"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div
        className="city-map-container"
        role="dialog"
        aria-modal="true"
        aria-label="城市漫步大地图"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 1. Header Toolbar */}
        <header className="city-map-header">
          <div className="map-header-left">
            <button
              className="map-back-home-btn"
              onClick={handleLeaveOuting}
              title="结束今天的街头漫步，一起牵手回家"
            >
              <span className="btn-icon">🏠</span>
              <span className="btn-text">牵手回家</span>
            </button>
            <div className="map-title-badge">
              <span className="map-title-emoji">🏙️</span>
              <div className="map-title-meta">
                <strong>城市漫步 · 自由约会</strong>
                <small>与 {companionName} 的街头时光 · 已探索 {outingStepCount} 站</small>
              </div>
            </div>
          </div>

          <div className="map-header-right">
            {/* Mobile Companion Focus Pill */}
            <button
              className="map-focus-koko-btn"
              onClick={handleFocusKoko}
              title={`镜头快速聚焦到${companionName}身边`}
            >
              <span className="focus-avatar-mini">
                <img src={kokoPortraitUrl} alt={companionName} />
              </span>
              <span className="focus-btn-text">找可可</span>
            </button>

            <div className="map-stat-pill wallet-pill" title="心愿星余额">
              <span>✦ {points}</span>
            </div>
            <div className="map-stat-pill location-pill" title="当前所处地点">
              <span>📍 {currentLocation.name}</span>
            </div>
            {onClose && (
              <button
                className="map-close-btn"
                onClick={onClose}
                title="关闭地图窗口（可可依然留在街头）"
                aria-label="关闭地图"
              >
                ✕
              </button>
            )}
          </div>
        </header>

        {/* 2. Interactive Overworld Canvas / Viewport */}
        <main className="city-map-viewport" ref={mapViewportRef}>
          <div className="city-map-canvas">
            {/* SVG Background Road Network & Water */}
            <svg
              className="city-map-svg-grid"
              viewBox="0 0 1000 680"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <linearGradient id="waterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#0284c7" stopOpacity="0.75" />
                </linearGradient>
                <linearGradient id="roadGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.95" />
                </linearGradient>
                <radialGradient id="lampGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#fef08a" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#fef08a" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Waterway / Ocean bay at bottom-right */}
              <path
                d="M 660 680 Q 740 460, 870 410 T 1000 360 L 1000 680 Z"
                fill="url(#waterGrad)"
              />
              <path
                d="M 690 680 Q 770 480, 890 430 T 1000 380"
                fill="none"
                stroke="#bae6fd"
                strokeWidth="3"
                strokeDasharray="8 6"
                opacity="0.8"
              />

              {/* Park green zone & Sakura grove */}
              <ellipse cx="350" cy="450" rx="170" ry="115" fill="#dcfce7" opacity="0.65" />
              <ellipse cx="250" cy="200" rx="145" ry="95" fill="#fce7f3" opacity="0.6" />
              <ellipse cx="750" cy="510" rx="120" ry="80" fill="#fed7aa" opacity="0.45" />

              {/* Major Streets and Connecting Pathways */}
              <path
                d="M 80 380 C 280 360, 480 420, 930 400"
                stroke="url(#roadGrad)"
                strokeWidth="42"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 480 70 C 490 260, 510 460, 540 650"
                stroke="url(#roadGrad)"
                strokeWidth="40"
                strokeLinecap="round"
                fill="none"
              />
              {/* Hotel / Seaside Boulevard */}
              <path
                d="M 480 400 Q 640 410, 750 510 T 880 540"
                stroke="url(#roadGrad)"
                strokeWidth="34"
                strokeLinecap="round"
                fill="none"
              />

              {/* Scenic Loop: School -> Park -> Seaside */}
              <path
                d="M 250 200 Q 170 340, 180 380 T 350 450 T 620 240 T 820 300 T 880 540"
                stroke="#cbd5e1"
                strokeWidth="20"
                strokeLinecap="round"
                fill="none"
                strokeDasharray="8 6"
              />

              {/* Road centerlines */}
              <path
                d="M 80 380 C 280 360, 480 420, 930 400"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeDasharray="14 10"
                fill="none"
              />
              <path
                d="M 480 70 C 490 260, 510 460, 540 650"
                stroke="#f59e0b"
                strokeWidth="2.5"
                strokeDasharray="14 10"
                fill="none"
              />

              {/* Street lamps with glowing radii */}
              {[
                { cx: 330, cy: 370 },
                { cx: 630, cy: 390 },
                { cx: 470, cy: 220 },
                { cx: 500, cy: 500 },
                { cx: 770, cy: 430 },
                { cx: 860, cy: 460 },
              ].map((lamp, i) => (
                <g key={`lamp-${i}`}>
                  <circle cx={lamp.cx} cy={lamp.cy} r="26" fill="url(#lampGlow)" />
                  <circle cx={lamp.cx} cy={lamp.cy} r="4" fill="#ca8a04" />
                </g>
              ))}

              {/* Floating Sakura Petals */}
              {[
                { cx: 270, cy: 170, r: 4 },
                { cx: 310, cy: 230, r: 5 },
                { cx: 220, cy: 260, r: 3 },
                { cx: 360, cy: 190, r: 4 },
                { cx: 400, cy: 420, r: 5 },
                { cx: 340, cy: 480, r: 4 },
              ].map((petal, i) => (
                <circle key={`petal-${i}`} cx={petal.cx} cy={petal.cy} r={petal.r} fill="#f472b6" opacity="0.65" />
              ))}
            </svg>

            {/* Landmarks Building Markers */}
            {CITY_LOCATIONS.map((loc) => {
              const isCurrent = loc.id === currentLocId;
              const isWished = wishedOuting.id === loc.id;
              const isLocked = affinity < loc.minAffinity;

              return (
                <div
                  key={loc.id}
                  className={`city-map-landmark ${isCurrent ? "active" : ""} ${isWished ? "wished" : ""} ${isLocked ? "locked" : ""}`}
                  style={{
                    left: `${loc.x}%`,
                    top: `${loc.y}%`,
                  }}
                  onClick={() => handleSelectLocation(loc)}
                  role="button"
                  tabIndex={0}
                  title={isLocked ? `亲密度 ${loc.minAffinity} 解锁「${loc.name}」` : loc.tagline}
                >
                  {/* Wished or Special Tag */}
                  {isWished && (
                    <div className="landmark-wish-badge animate-bounce">
                      <span>💭 可可最想去</span>
                      <small>好感×2</small>
                    </div>
                  )}

                  {/* Main Building Card Pin */}
                  <div className="landmark-card-body" style={{ borderColor: loc.themeColor }}>
                    <div className="landmark-icon-wrap" style={{ backgroundColor: `${loc.themeColor}18` }}>
                      <span className="landmark-emoji">{loc.emoji}</span>
                    </div>
                    <div className="landmark-info">
                      <div className="landmark-name-row">
                        <strong className="landmark-title">{loc.name}</strong>
                        {isLocked && <span className="lock-icon">🔒 ❤{loc.minAffinity}</span>}
                      </div>
                      <span className="landmark-desc">{loc.shortName} · {loc.category === "romance" ? "浪漫" : loc.category === "culture" ? "文艺" : "休闲"}</span>
                    </div>
                  </div>

                  {/* Active Destination Prompt & Enter Button */}
                  {isCurrent && (
                    <div className="landmark-door-action">
                      <button
                        className="enter-door-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenIndoor(loc);
                        }}
                        title={`进入${loc.name}，自由漫步探索`}
                      >
                        <span className="door-icon">🚪</span>
                        <span>进去看看</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Chibi Koko Avatar Sprite (Using Real Character Portrait) */}
            <div
              className={`chibi-koko-avatar ${isWalking ? "walking" : "idle"}`}
              style={{
                left: `${currentLocation.x}%`,
                top: `${currentLocation.y}%`,
              }}
            >
              {/* Cute thought bubble over Koko */}
              <div className="chibi-thought-bubble">
                {isWalking ? (
                  <span>走咯~ 迈小步中 🐾</span>
                ) : (
                  <span>在{currentLocation.shortName}前吹微风 ✨</span>
                )}
              </div>

              {/* Chibi Sprite Body with Real Character Art */}
              <div className="chibi-sprite-wrap">
                <div className="chibi-avatar-head">
                  <div className="chibi-portrait-crop">
                    <img
                      src={kokoPortraitUrl}
                      alt={companionName}
                      className="chibi-character-face-img"
                    />
                  </div>
                  <span className="chibi-ribbon-tag">🎀</span>
                </div>
                <div className="chibi-avatar-shadow" />
              </div>

              {/* Footprints trail */}
              {isWalking && (
                <div className="chibi-footsteps">
                  <span className="step step-1">👣</span>
                  <span className="step step-2">👣</span>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* 3. Integrated Bottom Deck (Quick Nav + Walking Chat, No Overflow) */}
        <footer className="city-map-bottom-deck">
          {/* Expanded Chat Messages Drawer */}
          {chatExpanded && (
            <div className="drawer-chat-body animate-fade-in">
              <div className="drawer-messages-list">
                {recentWalkingMessages.length === 0 && (
                  <div className="empty-walking-hint">
                    两个人正走在{currentLocation.name}的街道旁，海风与街景正好……发条消息跟她说说话吧~
                  </div>
                )}
                {recentWalkingMessages.map((msg) => (
                  <div key={msg.id} className={`walking-bubble-row ${msg.role === "user" ? "user" : "assistant"}`}>
                    <div className="walking-bubble-content">
                      {msg.content}
                    </div>
                  </div>
                ))}
                {streaming && (
                  <div className="walking-bubble-row assistant streaming">
                    <div className="walking-bubble-content">
                      <span className="typing-dots">可可正在想怎么回答……</span>
                    </div>
                  </div>
                )}
                <div ref={chatMessagesEndRef} />
              </div>
            </div>
          )}

          {/* Quick Location Pills Horizontal Rail */}
          <div className="deck-quick-nav-bar" aria-label="街区地点导航">
            <button
              type="button"
              className="deck-enter-indoor-btn"
              onClick={() => handleOpenIndoor(currentLocation)}
              title={`进入「${currentLocation.name}」探索专属剧情与动作`}
            >
              <span className="door-icon">🚪</span>
              <span className="door-text">进入{currentLocation.shortName}</span>
            </button>
            <div className="quick-bar-scroll">
              {CITY_LOCATIONS.map((loc) => {
                const isCurrent = loc.id === currentLocId;
                const isLocked = affinity < loc.minAffinity;
                const isWished = wishedOuting.id === loc.id;

                return (
                  <button
                    key={loc.id}
                    className={`quick-loc-pill ${isCurrent ? "active" : ""} ${isLocked ? "locked" : ""} ${isWished ? "wished" : ""}`}
                    disabled={isLocked}
                    onClick={() => handleSelectLocation(loc)}
                  >
                    <span className="pill-emoji">{loc.emoji}</span>
                    <span className="pill-name">{loc.shortName}</span>
                    {isWished && <span className="pill-star">★</span>}
                    {isLocked && <span className="pill-lock">🔒</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chat Input & Toggle Bar */}
          <div className="deck-chat-input-row">
            <button
              type="button"
              className={`chat-toggle-pill-btn ${chatExpanded ? "active" : ""}`}
              onClick={() => setChatExpanded(!chatExpanded)}
              title={chatExpanded ? "收起对话记录" : "展开随行对话记录"}
            >
              <span>💬</span>
              <span className="toggle-text">{chatExpanded ? "收起" : "对话"}</span>
            </button>

            <form className="deck-input-form" onSubmit={handleSendMessage}>
              <input
                type="text"
                className="deck-input"
                value={inputText}
                maxLength={120}
                placeholder={`和${companionName}边走边聊…（当前在：${currentLocation.name}）`}
                onChange={(e) => setInputText(e.target.value)}
                onFocus={() => setChatExpanded(true)}
              />
              <button
                type="submit"
                className="deck-send-btn"
                disabled={!inputText.trim() || streaming}
              >
                发送
              </button>
            </form>
          </div>
        </footer>

        {/* 4. High-Freedom Indoor Sandbox Venue Overlay */}
        {indoorLocation && (
          <IndoorVenueSandbox
            venueId={indoorLocation.id}
            onExit={() => setIndoorLocation(null)}
          />
        )}
      </div>
    </div>
  );
}
