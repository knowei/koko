import { useState } from "react";
import { useStore } from "@/store/companionStore";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function LifeCompanionModal({ isOpen, onClose }: Props) {
  const profile = useStore((s) => s.profile);
  const companionName = profile.name || "妹妹";
  const userNickname = profile.userNickname || "哥哥";
  const healthTracker = useStore((s) => s.healthTracker);
  const drinkWater = useStore((s) => s.drinkWater);
  const resetDailyWater = useStore((s) => s.resetDailyWater);
  const setSedentaryConfig = useStore((s) => s.setSedentaryConfig);
  const alarms = useStore((s) => s.alarms);
  const addAlarm = useStore((s) => s.addAlarm);
  const toggleAlarm = useStore((s) => s.toggleAlarm);
  const deleteAlarm = useStore((s) => s.deleteAlarm);

  const [activeSubTab, setActiveSubTab] = useState<"water" | "sedentary" | "alarms">("water");
  const [newAlarmTime, setNewAlarmTime] = useState("09:00");
  const [newAlarmLabel, setNewAlarmLabel] = useState("");
  const [waterSplashNotice, setWaterSplashNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDrinkWater = () => {
    const res = drinkWater();
    if (res.current === res.max) {
      setWaterSplashNotice(`🎉 太棒啦！今天 8 杯水（2000ml）目标达成！${companionName}夸${userNickname}超级健康~`);
    } else {
      setWaterSplashNotice(`💧 咕嘟咕嘟~ 第 ${res.current} 杯水打卡成功！身体水分满满~`);
    }
    setTimeout(() => setWaterSplashNotice(null), 3000);
  };

  const handleAddAlarm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlarmTime) return;
    addAlarm(newAlarmTime, newAlarmLabel || "生活提醒");
    setNewAlarmLabel("");
  };

  return (
    <div className="life-modal-overlay">
      <div className="life-modal-card">
        <header className="life-modal-header">
          <div className="life-header-title">
            <span className="life-icon">🌱</span>
            <div>
              <h3>健康与生活作息管家</h3>
              <p className="life-subtitle">
                按时喝水、远离久坐、准时提醒，{companionName}做{userNickname}的贴心生活小管家~
              </p>
            </div>
          </div>
          <button className="focus-close-btn" onClick={onClose}>✕</button>
        </header>

        {/* Sub Navigation Tabs */}
        <div className="life-sub-tabs">
          <button
            className={`life-tab-btn ${activeSubTab === "water" ? "active" : ""}`}
            onClick={() => setActiveSubTab("water")}
          >
            💧 喝水打卡 ({healthTracker.waterGlasses}/{healthTracker.waterGoal})
          </button>
          <button
            className={`life-tab-btn ${activeSubTab === "sedentary" ? "active" : ""}`}
            onClick={() => setActiveSubTab("sedentary")}
          >
            🪑 久坐关怀 ({healthTracker.sedentaryEnabled ? "已开启" : "已关闭"})
          </button>
          <button
            className={`life-tab-btn ${activeSubTab === "alarms" ? "active" : ""}`}
            onClick={() => setActiveSubTab("alarms")}
          >
            ⏰ 备忘闹钟 ({alarms.length})
          </button>
        </div>

        {/* Tab 1: Water Tracker */}
        {activeSubTab === "water" && (
          <div className="water-tracker-panel">
            <div className="water-header-info">
              <div className="water-stats">
                <span className="water-amount">
                  {healthTracker.waterGlasses * 250} <small>/ 2000 ml</small>
                </span>
                <span className="water-goal-desc">
                  已完成 {healthTracker.waterGlasses} / {healthTracker.waterGoal} 杯
                </span>
              </div>
              <button className="water-reset-btn" onClick={resetDailyWater} title="重置今日">
                🔄 重置
              </button>
            </div>

            {/* Visual Glasses Grid */}
            <div className="water-glasses-grid">
              {Array.from({ length: healthTracker.waterGoal }).map((_, idx) => {
                const isFilled = idx < healthTracker.waterGlasses;
                return (
                  <div
                    key={idx}
                    className={`water-cup-item ${isFilled ? "filled" : "empty"}`}
                    onClick={!isFilled ? handleDrinkWater : undefined}
                  >
                    <span className="cup-icon">{isFilled ? "🥛" : "🫙"}</span>
                    <span className="cup-num">第 {idx + 1} 杯</span>
                  </div>
                );
              })}
            </div>

            {waterSplashNotice && (
              <div className="water-splash-alert">{waterSplashNotice}</div>
            )}

            <div className="water-actions-bar">
              <button
                className="drink-water-action-btn"
                onClick={handleDrinkWater}
                disabled={healthTracker.waterGlasses >= healthTracker.waterGoal}
              >
                {healthTracker.waterGlasses >= healthTracker.waterGoal
                  ? "🎉 今日 8 杯水已全部达标！"
                  : "💧 点击喝一杯温水 (+250ml)"}
              </button>
            </div>
            <p className="water-care-tip">
              💡 {companionName}贴心提示：规律饮水能促进新陈代谢，让思维更敏捷哦！
            </p>
          </div>
        )}

        {/* Tab 2: Sedentary Reminder */}
        {activeSubTab === "sedentary" && (
          <div className="sedentary-panel">
            <div className="sedentary-setting-card">
              <div className="setting-info">
                <h4>久坐疲劳防损提醒</h4>
                <p>
                  开启后，当你在电脑前连续工作或学习超过设定时间，{companionName}会在桌面主动提醒你起身活动一下。
                </p>
              </div>
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={healthTracker.sedentaryEnabled}
                  onChange={(e) => setSedentaryConfig(e.target.checked)}
                />
                <span className="slider-round" />
              </label>
            </div>

            {healthTracker.sedentaryEnabled && (
              <div className="sedentary-interval-picker">
                <span>提醒间隔：</span>
                <div className="interval-buttons">
                  {[30, 45, 60, 90].map((mins) => (
                    <button
                      key={mins}
                      className={`interval-btn ${healthTracker.sedentaryIntervalMinutes === mins ? "active" : ""}`}
                      onClick={() => setSedentaryConfig(true, mins)}
                    >
                      {mins} 分钟
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="sedentary-tips-box">
              <h5>🧘‍♀️ {companionName}推荐的 30 秒微放松：</h5>
              <ul>
                <li>👀 眺望 6 米外的远方，眨眼放松眼部睫状肌</li>
                <li>🙆‍♂️ 双手上举交叠，向上拉伸背部与脊椎</li>
                <li>🚶‍♀️ 离开座位走动两步，喝一口温水</li>
              </ul>
            </div>
          </div>
        )}

        {/* Tab 3: Custom Alarms */}
        {activeSubTab === "alarms" && (
          <div className="alarms-panel">
            <form className="alarm-add-form" onSubmit={handleAddAlarm}>
              <input
                type="time"
                value={newAlarmTime}
                onChange={(e) => setNewAlarmTime(e.target.value)}
                className="alarm-time-input"
                required
              />
              <input
                type="text"
                placeholder="提醒事项（如：开会、吃药、叫外卖）"
                value={newAlarmLabel}
                onChange={(e) => setNewAlarmLabel(e.target.value)}
                className="alarm-label-input"
                maxLength={30}
              />
              <button type="submit" className="alarm-add-btn">
                ＋ 添加提醒
              </button>
            </form>

            <div className="alarms-list">
              {alarms.length === 0 ? (
                <div className="alarms-empty">
                  <span>⏰</span>
                  <p>暂无定时提醒，快在上方设定一个吧~</p>
                </div>
              ) : (
                alarms.map((alarm) => (
                  <div key={alarm.id} className={`alarm-item-card ${alarm.enabled ? "enabled" : "disabled"}`}>
                    <div className="alarm-time-display">{alarm.time}</div>
                    <div className="alarm-label-display">{alarm.label}</div>
                    <div className="alarm-controls">
                      <label className="switch-label small">
                        <input
                          type="checkbox"
                          checked={alarm.enabled}
                          onChange={() => toggleAlarm(alarm.id)}
                        />
                        <span className="slider-round" />
                      </label>
                      <button
                        className="alarm-del-btn"
                        onClick={() => deleteAlarm(alarm.id)}
                        title="删除提醒"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
