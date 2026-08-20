import { useEffect, useState } from "react";
import { useStore } from "@/store/companionStore";
import { affinityLevel, getRoutine, moodLabel, personalityLabel } from "@/data/persona";
import { EXPRESSION_MAP } from "@/lib/messageParser";
import { Avatar } from "@/components/Avatar";
import { ChatScreen } from "@/components/ChatScreen";
import { SidePanel } from "@/components/SidePanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { CharacterStage } from "@/components/CharacterStage";
import { RandomEventModal } from "@/components/RandomEventModal";
import { ShopScreen } from "@/components/ShopScreen";
import { MemoryScreen } from "@/components/MemoryScreen";

export default function App() {
  const affinity = useStore((s) => s.affinity);
  const mood = useStore((s) => s.mood);
  const provider = useStore((s) => s.provider);
  const personality = useStore((s) => s.personality);
  const resetMemory = useStore((s) => s.resetMemory);
  const profile = useStore((s) => s.profile);
  const weather = useStore((s) => s.weather);
  const activeSkin = useStore((s) => s.activeSkin);
  const currentExpression = useStore((s) => s.currentExpression);
  const setWeather = useStore((s) => s.setWeather);
  const syncWallet = useStore((s) => s.syncWallet);
  const [showSettings, setShowSettings] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "life" | "shop" | "memories">("chat");
  const [now, setNow] = useState(() => new Date());
  const greetOnReturn = useStore((s) => s.greetOnReturn);
  const proactivePing = useStore((s) => s.proactivePing);
  const markActive = useStore((s) => s.markActive);
  const checkAgreementReminders = useStore((s) => s.checkAgreementReminders);

  const lv = affinityLevel(affinity);
  const routine = getRoutine(now.getHours());
  const currentTime = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

  useEffect(() => {
    void syncWallet();
  }, [syncWallet]);

  useEffect(() => {
    const reminder = window.setTimeout(() => checkAgreementReminders(), 1800);
    const daily = window.setInterval(() => checkAgreementReminders(), 30 * 60_000);
    return () => { window.clearTimeout(reminder); window.clearInterval(daily); };
  }, [checkAgreementReminders]);

  useEffect(() => {
    greetOnReturn();
    const clock = window.setInterval(() => setNow(new Date()), 60_000);
    let idle = window.setTimeout(() => proactivePing(), 90_000);
    const resetIdle = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(() => proactivePing(), 90_000);
    };
    const visibility = () => {
      if (document.hidden) markActive();
      else { greetOnReturn(); resetIdle(); }
    };
    window.addEventListener("pointerdown", resetIdle);
    window.addEventListener("keydown", resetIdle);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(clock); window.clearTimeout(idle);
      window.removeEventListener("pointerdown", resetIdle);
      window.removeEventListener("keydown", resetIdle);
      document.removeEventListener("visibilitychange", visibility);
      markActive();
    };
  }, [greetOnReturn, markActive, proactivePing]);

  useEffect(() => {
    if (weather && Date.now() - weather.updatedAt < 30 * 60_000) return;
    const controller = new AbortController();
    const load = (url: string) => fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (response.ok) setWeather(data);
      })
      .catch(() => undefined);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => void load(`/api/weather?lat=${position.coords.latitude}&lon=${position.coords.longitude}`),
        () => { if (profile.city) void load(`/api/weather?city=${encodeURIComponent(profile.city)}`); },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30 * 60_000 },
      );
    } else if (profile.city) void load(`/api/weather?city=${encodeURIComponent(profile.city)}`);
    return () => controller.abort();
  }, [profile.city, setWeather, weather]);

  return (
    <div className="app">
      <div className="phone">
        <header className="topbar">
          <div className="who">
            <div className="avatar-header-box">
              <Avatar name={profile.name} skin={activeSkin} size={54} />
              {currentExpression !== "normal" && (
                <div
                  className="avatar-expression-badge"
                  key={currentExpression}
                  title={`当前表情：${EXPRESSION_MAP[currentExpression].label}`}
                >
                  {EXPRESSION_MAP[currentExpression].emoji}
                </div>
              )}
            </div>
            <div className="who-text">
              <div className="who-name">{profile.name}</div>
              <div className="routine-inline">{currentTime} · {routine.emoji} {routine.label}</div>
              <div className="who-sub" style={{ color: lv.color }}>
                {lv.name} · {personalityLabel(personality, affinity)} · 心情 {moodLabel(mood)}
              </div>
              {weather && <div className="weather-inline">{weather.location} · {weather.label} {weather.temperature}℃</div>}
            </div>
          </div>
          <div className="top-actions">
            <button className="ghost-btn desktop-memory-btn" onClick={() => setActiveView(activeView === "memories" ? "chat" : "memories")}>
              {activeView === "memories" ? "← 返回" : "📖 回忆"}
            </button>
            <button className="ghost-btn desktop-shop-btn" onClick={() => setActiveView(activeView === "shop" ? "chat" : "shop")}>
              {activeView === "shop" ? "← 返回" : "✦ 商城"}
            </button>
            <button className="ghost-btn account-top-btn" title="账号与云同步" onClick={() => setShowSettings(true)}>
              👤 {localStorage.getItem("koko-account-token") ? "已登录" : "登录"}
            </button>
            <button className="ghost-btn" title="设置供应商" onClick={() => setShowSettings(true)}>
              ⚙ {provider.mode === "custom" ? "自定义" : "默认"}
            </button>
            <button
              className="ghost-btn"
              title="清空记忆重新开始"
              onClick={() => {
                if (confirm("重新开始会清空聊天、亲密度、心情、性格成长和外出记录，但会保留 API 设置。确定吗？")) resetMemory();
              }}
            >
              ↺
            </button>
          </div>
        </header>

        <div className="affinity-wrap" title={`亲密度 ${affinity}/100`}>
          <div className="affinity-fill" style={{ width: `${affinity}%`, background: lv.color }} />
          <span className="affinity-num">❤ {affinity}</span>
        </div>

        <main className={`stage mobile-${activeView} ${activeView === "shop" || activeView === "memories" ? "shop-view" : ""}`}>
          {activeView === "shop" ? <ShopScreen /> : activeView === "memories" ? <MemoryScreen /> : <>
            <div className="chat-pane"><ChatScreen /></div>
            <div className="life-pane"><CharacterStage /><SidePanel /></div>
          </>}
        </main>

        <nav className="mobile-nav" aria-label="手机端导航">
          <button className={activeView === "chat" ? "active" : ""} onClick={() => setActiveView("chat")}>💬<span>聊天</span></button>
          <button className={activeView === "life" ? "active" : ""} onClick={() => setActiveView("life")}>🎡<span>陪伴</span></button>
          <button className={activeView === "shop" ? "active" : ""} onClick={() => setActiveView("shop")}>🛍️<span>商城</span></button>
          <button className={activeView === "memories" ? "active" : ""} onClick={() => setActiveView("memories")}>📖<span>回忆</span></button>
          <button onClick={() => setShowSettings(true)}>⚙️<span>设置</span></button>
        </nav>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      <RandomEventModal />
    </div>
  );
}
