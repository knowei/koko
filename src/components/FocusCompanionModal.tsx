import { useState, useEffect, useRef } from "react";
import { useStore } from "@/store/companionStore";
import { whiteNoise, type WhiteNoiseType } from "@/lib/whiteNoise";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_DURATIONS = [
  { label: "15 分钟 · 极速专注", minutes: 15 },
  { label: "25 分钟 · 经典番茄", minutes: 25 },
  { label: "45 分钟 · 深度研习", minutes: 45 },
  { label: "60 分钟 · 沉浸心流", minutes: 60 },
];

const NOISE_OPTIONS: Array<{ type: WhiteNoiseType; label: string; icon: string }> = [
  { type: "rain", label: "柔和细雨", icon: "🌧️" },
  { type: "breeze", label: "森林微风", icon: "🌲" },
  { type: "pink_noise", label: "专注粉噪", icon: "🎧" },
  { type: "campfire", label: "暖心壁炉", icon: "🪵" },
  { type: "none", label: "静音专注", icon: "🍃" },
];

export function FocusCompanionModal({ isOpen, onClose }: Props) {
  const profile = useStore((s) => s.profile);
  const companionName = profile.name || "妹妹";
  const userNickname = profile.userNickname || "哥哥";
  const focusStats = useStore((s) => s.focusStats);
  const finishFocusSession = useStore((s) => s.finishFocusSession);

  const [targetMinutes, setTargetMinutes] = useState<number>(25);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(25 * 60);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [mode, setMode] = useState<"focus" | "break">("focus");
  const [noiseType, setNoiseType] = useState<WhiteNoiseType>("rain");
  const [noiseVolume, setNoiseVolume] = useState<number>(0.4);
  const [sessionLabel, setSessionLabel] = useState<string>("专注伴读");
  const [settlement, setSettlement] = useState<{
    affinityGain: number;
    moodGain: number;
    pointsGain: number;
    notice: string;
    minutes: number;
  } | null>(null);

  const timerRef = useRef<number | null>(null);

  // Synchronize initial remaining time when changing target
  const handleSelectPreset = (mins: number) => {
    if (isRunning) return;
    setTargetMinutes(mins);
    setSecondsRemaining(mins * 60);
  };

  // Timer loop
  useEffect(() => {
    if (isRunning && secondsRemaining > 0) {
      timerRef.current = window.setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            handleCompleteSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRunning, secondsRemaining]);

  // Manage white noise playback
  useEffect(() => {
    if (isOpen && isRunning && noiseType !== "none") {
      whiteNoise.play(noiseType, noiseVolume);
    } else {
      whiteNoise.stop();
    }

    return () => {
      whiteNoise.stop();
    };
  }, [isOpen, isRunning, noiseType, noiseVolume]);

  const handleStart = () => {
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setSecondsRemaining(targetMinutes * 60);
  };

  const handleCompleteSession = async () => {
    setIsRunning(false);
    whiteNoise.stop();
    if (mode === "focus") {
      const res = await finishFocusSession(targetMinutes, sessionLabel);
      setSettlement({
        ...res,
        minutes: targetMinutes,
      });
    } else {
      // Break session finished
      setSettlement({
        affinityGain: 1,
        moodGain: 4,
        pointsGain: 2,
        notice: "休息结束啦！精神充沛地开启下一段专注吧~",
        minutes: targetMinutes,
      });
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const totalSecs = targetMinutes * 60;
  const progress = totalSecs > 0 ? (totalSecs - secondsRemaining) / totalSecs : 0;
  const strokeDashoffset = 565.48 * (1 - progress);

  if (!isOpen) return null;

  return (
    <div className="focus-modal-overlay">
      <div className="focus-modal-card">
        <header className="focus-modal-header">
          <div className="focus-header-title">
            <span className="focus-icon">🍅</span>
            <div>
              <h3>{mode === "focus" ? `${companionName}的专注伴读` : "舒缓小憩时光"}</h3>
              <p className="focus-subtitle">
                {mode === "focus"
                  ? `${userNickname}专心工作或学习，${companionName}在身旁安静守护`
                  : "闭目养神、活动筋骨，让疲惫的心情放松一下吧"}
              </p>
            </div>
          </div>
          <button className="focus-close-btn" onClick={onClose}>✕</button>
        </header>

        {/* Stats Pill Bar */}
        <div className="focus-stats-bar">
          <div className="focus-stat-item">
            <span className="stat-label">今日专注</span>
            <strong className="stat-val">{focusStats.todayMinutes} 分钟</strong>
          </div>
          <div className="focus-stat-item">
            <span className="stat-label">累计达标</span>
            <strong className="stat-val">{focusStats.completedCount} 次</strong>
          </div>
          <div className="focus-stat-item">
            <span className="stat-label">历史总时长</span>
            <strong className="stat-val">{focusStats.totalMinutes} 分钟</strong>
          </div>
        </div>

        {/* Mode Switcher */}
        {!isRunning && (
          <div className="focus-mode-toggle">
            <button
              className={`focus-mode-btn ${mode === "focus" ? "active" : ""}`}
              onClick={() => {
                setMode("focus");
                setTargetMinutes(25);
                setSecondsRemaining(25 * 60);
              }}
            >
              📖 专注伴读
            </button>
            <button
              className={`focus-mode-btn ${mode === "break" ? "active" : ""}`}
              onClick={() => {
                setMode("break");
                setTargetMinutes(5);
                setSecondsRemaining(5 * 60);
              }}
            >
              ☕ 舒缓小憩
            </button>
          </div>
        )}

        {/* Circular Progress Display */}
        <div className="focus-timer-container">
          <div className="circular-progress-wrap">
            <svg className="circular-progress-svg" viewBox="0 0 200 200">
              <circle
                className="progress-bg"
                cx="100"
                cy="100"
                r="90"
                strokeWidth="10"
              />
              <circle
                className={`progress-bar ${mode === "break" ? "break-mode" : ""}`}
                cx="100"
                cy="100"
                r="90"
                strokeWidth="10"
                strokeDasharray="565.48"
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                transform="rotate(-90 100 100)"
              />
            </svg>
            <div className="circular-inner-content">
              <span className="timer-text">{formatTime(secondsRemaining)}</span>
              <span className="companion-speech-bubble">
                {isRunning
                  ? mode === "focus"
                    ? `“${userNickname}加油，我就在你身边哦~”`
                    : "“深呼吸~ 放松一下肩膀和眼睛~”"
                  : mode === "focus"
                    ? `“准备好了吗？点击开始进入心流吧~”`
                    : "“休息片刻，喝口水吧~”"}
              </span>
            </div>
          </div>
        </div>

        {/* Duration Presets & Custom Goal */}
        {!isRunning && mode === "focus" && (
          <>
            <div className="focus-label-row">
              <input
                type="text"
                value={sessionLabel}
                onChange={(e) => setSessionLabel(e.target.value)}
                placeholder="输入专注目标（如：研读文档、攻克代码）"
                className="focus-label-input"
                maxLength={30}
              />
            </div>
            <div className="duration-presets-grid">
              {PRESET_DURATIONS.map((preset) => (
                <button
                  key={preset.minutes}
                  className={`preset-btn ${targetMinutes === preset.minutes ? "selected" : ""}`}
                  onClick={() => handleSelectPreset(preset.minutes)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </>
        )}

        {/* White Noise Selector */}
        <div className="white-noise-panel">
          <div className="noise-header">
            <span>🎧 舒缓白噪音伴奏</span>
            {noiseType !== "none" && (
              <input
                type="range"
                min="0.05"
                max="1"
                step="0.05"
                value={noiseVolume}
                onChange={(e) => setNoiseVolume(parseFloat(e.target.value))}
                className="noise-vol-slider"
                title="音量调节"
              />
            )}
          </div>
          <div className="noise-options-row">
            {NOISE_OPTIONS.map((item) => (
              <button
                key={item.type}
                className={`noise-btn ${noiseType === item.type ? "active" : ""}`}
                onClick={() => setNoiseType(item.type)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Action Controls */}
        <div className="focus-controls-row">
          {!isRunning ? (
            <button className="focus-action-btn primary start-btn" onClick={handleStart}>
              ▶ 开始专注
            </button>
          ) : (
            <>
              <button className="focus-action-btn secondary" onClick={handlePause}>
                ⏸ 暂停
              </button>
              <button className="focus-action-btn warning" onClick={handleReset}>
                ⏹ 放弃本次
              </button>
            </>
          )}
        </div>

        {/* Settlement Modal */}
        {settlement && (
          <div className="settlement-overlay">
            <div className="settlement-card focus-settlement">
              <div className="settlement-badge">🎉 专注达成</div>
              <h4>{mode === "focus" ? `高效专注 ${settlement.minutes} 分钟` : "舒缓休息完成"}</h4>
              <p className="settlement-quote">
                “{userNickname}辛苦啦！每一点认真付出的时间，都在让你变得更棒呢~”
              </p>
              <div className="rewards-grid">
                <div className="reward-chip affinity">💖 亲密度 +{settlement.affinityGain}</div>
                <div className="reward-chip mood">🌸 心情 +{settlement.moodGain}</div>
                <div className="reward-chip points">✦ 心愿星 +{settlement.pointsGain}</div>
              </div>
              <button
                className="settlement-btn primary"
                onClick={() => {
                  setSettlement(null);
                  handleReset();
                }}
              >
                收到鼓励，继续前行 ✨
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
