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
import { GameZoneScreen } from "@/components/GameZoneScreen";
import { AccountModal } from "@/components/AccountModal";
import { DesktopPetWidget } from "@/components/DesktopPetWidget";
import { FocusCompanionModal } from "@/components/FocusCompanionModal";
import { StickyNotesModal } from "@/components/StickyNotesModal";
import { LifeCompanionModal } from "@/components/LifeCompanionModal";
import { LorebookModal } from "@/components/LorebookModal";
import { useConfirmDialog } from "@/components/ConfirmDialog";

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      switchWindowMode: (mode: "full" | "mini") => void;
      minimize: () => void;
      close: () => void;
      setStickyExpanded?: (expanded: boolean) => void;
      hideStickyWindow?: () => void;
      openStickyManager?: () => void;
      onStickyReset?: (cb: () => void) => () => void;
      captureScreenFrame?: () => Promise<string | null>;
      onWindowModeChange: (cb: (mode: "full" | "mini") => void) => void;
      onTrayAction?: (cb: (action: "sticky" | "focus" | "life" | "settings") => void) => () => void;
    };
  }
}

export default function App() {
  const confirmDialog = useConfirmDialog();
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
  const customBgImage = useStore((s) => s.customBgImage);
  const [showSettings, setShowSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showPetWidget, setShowPetWidget] = useState(false);
  const [showFocusModal, setShowFocusModal] = useState(false);
  const [showStickyModal, setShowStickyModal] = useState(false);
  const [showLifeModal, setShowLifeModal] = useState(false);
  const [showLorebookModal, setShowLorebookModal] = useState(false);
  const [isMiniCompanion, setIsMiniCompanion] = useState(() => {
    return typeof window !== "undefined" && window.location.search.includes("mode=pet");
  });
  const [activeView, setActiveView] = useState<"chat" | "life" | "shop" | "memories" | "games">("chat");
  const [now, setNow] = useState(() => new Date());
  const greetOnReturn = useStore((s) => s.greetOnReturn);
  const proactivePing = useStore((s) => s.proactivePing);
  const markActive = useStore((s) => s.markActive);
  const checkAgreementReminders = useStore((s) => s.checkAgreementReminders);

  useEffect(() => {
    if (window.electronAPI?.onWindowModeChange) {
      window.electronAPI.onWindowModeChange((mode) => {
        setIsMiniCompanion(mode === "mini");
      });
    }
  }, []);

  useEffect(() => {
    return window.electronAPI?.onTrayAction?.((action) => {
      setIsMiniCompanion(false);
      if (action === "sticky") setShowStickyModal(true);
      if (action === "focus") setShowFocusModal(true);
      if (action === "life") setShowLifeModal(true);
      if (action === "settings") setShowSettings(true);
    });
  }, []);

  useEffect(() => {
    if (isMiniCompanion) {
      document.documentElement.classList.add("transparent-mode");
      document.body.classList.add("transparent-mode");
    } else {
      document.documentElement.classList.remove("transparent-mode");
      document.body.classList.remove("transparent-mode");
    }
  }, [isMiniCompanion]);

  useEffect(() => {
    const companionName = profile.name.trim();
    document.title = companionName && companionName !== "妹妹"
      ? `${companionName} · 妹妹陪伴`
      : "妹妹陪伴";
  }, [profile.name]);

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

  if (isMiniCompanion) {
    return (
      <div className="standalone-pet-root">
        <DesktopPetWidget
          onClose={() => {
            if (window.electronAPI) {
              window.electronAPI.switchWindowMode("full");
            } else {
              setIsMiniCompanion(false);
            }
          }}
          isPipWindow={true}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <div
        className={`phone ${customBgImage ? "has-custom-bg" : ""}`}
        style={customBgImage ? {
          backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.88)), url(${customBgImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat"
        } : undefined}
      >
        {window.electronAPI?.isElectron && <div className="desktop-drag-strip" title="按住这里拖动窗口" />}
        <header className="topbar">
          <div className="who">
            <div className="avatar-header-box">
              <Avatar name={profile.name || "妹妹"} skin={activeSkin} size={54} />
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
              <div className="who-name">{profile.name || "妹妹"}</div>
              <div className="routine-inline">{currentTime} · {routine.emoji} {routine.label}</div>
              <div className="who-sub" style={{ color: lv.color }}>
                {lv.name} · {personalityLabel(personality, affinity)} · 心情 {moodLabel(mood)}
              </div>
              {weather && <div className="weather-inline">{weather.location} · {weather.label} {weather.temperature}℃</div>}
            </div>
          </div>
          <div className="top-actions">
            {/* 1. Main View Navigation Pills */}
            <div className="nav-pill-group" role="tablist">
              <button
                className={`top-nav-btn ${activeView === "chat" || activeView === "life" ? "active" : ""}`}
                onClick={() => setActiveView("chat")}
                title="返回伴侣聊天与互动主界面"
              >
                💬 陪伴
              </button>
              <button
                className={`top-nav-btn ${activeView === "games" ? "active" : ""}`}
                onClick={() => setActiveView(activeView === "games" ? "chat" : "games")}
                title="双人娱乐坊（象棋、围棋、五子棋、翻牌等）"
              >
                🎮 娱乐
                <span className="mini-badge-dot" />
              </button>
              <button
                className={`top-nav-btn ${activeView === "memories" ? "active" : ""}`}
                onClick={() => setActiveView(activeView === "memories" ? "chat" : "memories")}
                title="回忆手账与用户画像档案"
              >
                📖 回忆
              </button>
              <button
                className={`top-nav-btn ${activeView === "shop" ? "active" : ""}`}
                onClick={() => setActiveView(activeView === "shop" ? "chat" : "shop")}
                title="心愿商城与装扮"
              >
                ✦ 商城
              </button>
            </div>

            {/* 2. Life & Focus Companion Quick Tools */}
            <div className="tools-pill-group">
              <button
                className="tool-pill-btn pet-tool-btn"
                title="切换为桌面悬浮陪伴小窗"
                onClick={() => {
                  if (window.electronAPI) {
                    window.electronAPI.switchWindowMode("mini");
                  } else {
                    setShowPetWidget(true);
                  }
                }}
              >
                🌸 悬浮
              </button>
              <button
                className="tool-pill-btn focus-tool-btn"
                title="番茄钟专注伴读与舒缓白噪音"
                onClick={() => setShowFocusModal(true)}
              >
                🍅 专注
              </button>
              <button
                className="tool-pill-btn life-tool-btn"
                title="喝水打卡与健康作息管家"
                onClick={() => setShowLifeModal(true)}
              >
                💧 作息
              </button>
              <button
                className="tool-pill-btn sticky-tool-btn"
                title="随手便签与待办清单"
                onClick={() => setShowStickyModal(true)}
              >
                📌 便签
              </button>
              <button
                className="tool-pill-btn lorebook-tool-btn"
                title="专属世界书与深度记忆设定"
                onClick={() => setShowLorebookModal(true)}
              >
                📖 世界书
              </button>
            </div>

            {/* 3. System & Account Actions */}
            <div className="system-icon-group">
              <button
                className="system-btn account-top-btn"
                title="账号与云同步"
                onClick={() => setShowAccount(true)}
              >
                👤 <span>{localStorage.getItem("koko-account-token") ? "已登录" : "登录"}</span>
              </button>
              <button
                className="system-btn"
                title={`设置模型与供应商 (${provider.mode === "custom" ? "自定义" : "默认"})`}
                onClick={() => setShowSettings(true)}
              >
                ⚙
              </button>
              <button
                className="system-btn reset-btn"
                title="清空记忆重新开始"
                onClick={async () => {
                  const confirmed = await confirmDialog({
                    title: "重新开始陪伴？",
                    description: "聊天、亲密度、心情、性格成长和外出记录都会清空，但会保留 API 设置。",
                    confirmLabel: "重新开始",
                    tone: "danger",
                  });
                  if (confirmed) resetMemory();
                }}
              >
                ↺
              </button>
            </div>

            {window.electronAPI?.isElectron && (
              <div className="desktop-win-controls">
                <button
                  className="win-ctrl-btn"
                  title="最小化"
                  onClick={() => window.electronAPI?.minimize()}
                >
                  —
                </button>
                <button
                  className="win-ctrl-btn win-close"
                  title="退出"
                  onClick={() => window.electronAPI?.close()}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="affinity-wrap" title={`亲密度 ${affinity}/100`}>
          <div className="affinity-fill" style={{ width: `${affinity}%`, background: lv.color }} />
          <span className="affinity-num">❤ {affinity}</span>
        </div>

        <main className={`stage mobile-${activeView} ${activeView === "shop" || activeView === "memories" || activeView === "games" ? "shop-view" : ""}`}>
          {activeView === "shop" ? (
            <ShopScreen />
          ) : activeView === "memories" ? (
            <MemoryScreen onOpenLorebook={() => setShowLorebookModal(true)} />
          ) : activeView === "games" ? (
            <GameZoneScreen onBack={() => setActiveView("life")} />
          ) : (
            <>
              <div className="chat-pane">
                <ChatScreen
                  onOpenGames={() => setActiveView("games")}
                  onOpenFocus={() => setShowFocusModal(true)}
                  onOpenLife={() => setShowLifeModal(true)}
                  onOpenSticky={() => setShowStickyModal(true)}
                  onOpenLorebook={() => setShowLorebookModal(true)}
                />
              </div>
              <div className="life-pane">
                <CharacterStage />
                <SidePanel
                  onOpenGames={() => setActiveView("games")}
                  onOpenFocus={() => setShowFocusModal(true)}
                  onOpenLife={() => setShowLifeModal(true)}
                  onOpenSticky={() => setShowStickyModal(true)}
                  onOpenLorebook={() => setShowLorebookModal(true)}
                />
              </div>
            </>
          )}
        </main>

        <nav className="mobile-nav" aria-label="手机端导航">
          <button className={activeView === "chat" ? "active" : ""} onClick={() => setActiveView("chat")}>💬<span>聊天</span></button>
          <button className={activeView === "life" ? "active" : ""} onClick={() => setActiveView("life")}>🎡<span>互动</span></button>
          <button className={activeView === "shop" ? "active" : ""} onClick={() => setActiveView("shop")}>🛍️<span>商城</span></button>
          <button className={activeView === "memories" ? "active" : ""} onClick={() => setActiveView("memories")}>📖<span>回忆</span></button>
          <button onClick={() => {
            if (window.electronAPI) window.electronAPI.switchWindowMode("mini");
            else setShowPetWidget(true);
          }}>🌸<span>悬浮</span></button>
          <button onClick={() => setShowSettings(true)}>⚙️<span>设置</span></button>
        </nav>
      </div>

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onOpenAccount={() => setShowAccount(true)}
          onOpenLorebook={() => setShowLorebookModal(true)}
        />
      )}
      {showAccount && <AccountModal onClose={() => setShowAccount(false)} />}
      {showPetWidget && <DesktopPetWidget onClose={() => setShowPetWidget(false)} />}
      <FocusCompanionModal isOpen={showFocusModal} onClose={() => setShowFocusModal(false)} />
      <StickyNotesModal isOpen={showStickyModal} onClose={() => setShowStickyModal(false)} />
      <LifeCompanionModal isOpen={showLifeModal} onClose={() => setShowLifeModal(false)} />
      <LorebookModal open={showLorebookModal} onClose={() => setShowLorebookModal(false)} />
      <RandomEventModal />
    </div>
  );
}
