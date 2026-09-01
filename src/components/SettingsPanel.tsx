import { useState } from "react";
import { useStore } from "@/store/companionStore";
import type { ProviderCfg } from "@/lib/chat";
import type { ReplyStyle } from "@/data/persona";
import type { TTSSettings } from "@/lib/tts";
import { apiUrl, getApiBaseUrl, setApiBaseUrl } from "@/lib/api";
import { VoiceSettingsSection } from "@/components/settings/VoiceSettingsSection";
import { useConfirmDialog } from "@/components/ConfirmDialog";

export function SettingsPanel({
  onClose,
  onOpenAccount,
  onOpenLorebook,
}: {
  onClose: () => void;
  onOpenAccount?: () => void;
  onOpenLorebook?: () => void;
}) {
  const confirmDialog = useConfirmDialog();
  const provider = useStore((s) => s.provider);
  const setProvider = useStore((s) => s.setProvider);
  const replyStyle = useStore((s) => s.replyStyle);
  const setReplyStyle = useStore((s) => s.setReplyStyle);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const weather = useStore((s) => s.weather);
  const setWeather = useStore((s) => s.setWeather);
  const ttsSettings = useStore((s) => s.ttsSettings);
  const setTtsSettings = useStore((s) => s.setTtsSettings);

  const [mode, setMode] = useState<ProviderCfg["mode"]>(provider.mode);
  const [baseURL, setBaseURL] = useState(provider.baseURL ?? "https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState(provider.apiKey ?? "");
  const [model, setModel] = useState(provider.model ?? "gpt-4o-mini");
  const [visionEnabled, setVisionEnabled] = useState(provider.visionProvider?.enabled || false);
  const [visionBaseURL, setVisionBaseURL] = useState(provider.visionProvider?.baseURL || "https://api.openai.com/v1");
  const [visionApiKey, setVisionApiKey] = useState(provider.visionProvider?.apiKey || "");
  const [visionModel, setVisionModel] = useState(provider.visionProvider?.model || "gpt-4o-mini");

  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [manual, setManual] = useState(true);
  const [style, setStyle] = useState<ReplyStyle>(replyStyle);
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(String(profile.age));
  const [birthday, setBirthday] = useState(profile.birthday);
  const [userNickname, setUserNickname] = useState(profile.userNickname);
  const [city, setCity] = useState(profile.city);
  const [weatherPreview, setWeatherPreview] = useState(weather);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherErr, setWeatherErr] = useState<string | null>(null);
  const exportSave = useStore((s) => s.exportSave);
  const importSave = useStore((s) => s.importSave);
  const [serverUrl, setServerUrl] = useState(() => getApiBaseUrl());
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const accountToken = localStorage.getItem("koko-account-token") || "";

  // TTS Settings
  const [ttsEnabled, setTtsEnabled] = useState(ttsSettings.enabled);
  const [ttsAutoPlay, setTtsAutoPlay] = useState(ttsSettings.autoPlay);
  const [ttsEngine, setTtsEngine] = useState<TTSSettings["engine"]>(ttsSettings.engine);
  const [ttsVoice, setTtsVoice] = useState(ttsSettings.voice);
  const [ttsRate, setTtsRate] = useState(ttsSettings.rate);
  const [ttsPitch, setTtsPitch] = useState(ttsSettings.pitch);
  const [ttsEmotionStyle, setTtsEmotionStyle] = useState<TTSSettings["emotionStyle"]>(ttsSettings.emotionStyle || "auto");
  const [ttsMoodModulation, setTtsMoodModulation] = useState(ttsSettings.moodModulation);
  const [customTtsUrl, setCustomTtsUrl] = useState(ttsSettings.customBaseURL ?? "");
  const [customTtsKey, setCustomTtsKey] = useState(ttsSettings.customApiKey ?? "");
  const [customTtsModel, setCustomTtsModel] = useState(ttsSettings.customModel ?? "tts-1");
  const [customTtsVoice, setCustomTtsVoice] = useState(ttsSettings.customVoice ?? "alloy");
  const [fishApiKey, setFishApiKey] = useState(ttsSettings.fishApiKey ?? "");
  const [fishReferenceId, setFishReferenceId] = useState(ttsSettings.fishReferenceId ?? "");
  const [fishModel, setFishModel] = useState(
    ttsSettings.fishModel?.startsWith("fishaudio-") ? ttsSettings.fishModel : "fishaudio-s21pro-flash",
  );

  const downloadSave = () => {
    const blob = new Blob([JSON.stringify(exportSave(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `koko-save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setSaveNotice("存档已导出；API Key 未包含在文件中。");
  };

  const loadSave = async (file?: File) => {
    if (!file) return;
    const confirmed = await confirmDialog({
      title: "导入这份存档？",
      description: "当前聊天、关系、积分、档案和记忆将被覆盖，但会保留 API 设置。",
      confirmLabel: "确认导入",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      const error = importSave(JSON.parse(await file.text()));
      setSaveNotice(error || "存档导入成功，API 设置已保留。");
    } catch {
      setSaveNotice("存档文件无法解析。");
    }
  };

  const refreshWeather = async () => {
    const value = city.trim();
    if (!value) return;
    setWeatherLoading(true);
    setWeatherErr(null);
    try {
      const r = await fetch(apiUrl(`/api/weather?city=${encodeURIComponent(value)}`));
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setWeatherPreview(j);
    } catch (e) {
      setWeatherErr(e instanceof Error ? e.message : String(e));
    } finally {
      setWeatherLoading(false);
    }
  };

  const locateWeather = () => {
    if (!navigator.geolocation) {
      setWeatherErr("当前设备或浏览器不支持地理位置定位，可手动输入城市。");
      return;
    }
    setWeatherLoading(true);
    setWeatherErr(null);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const r = await fetch(apiUrl(`/api/weather?lat=${position.coords.latitude}&lon=${position.coords.longitude}`));
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setWeatherPreview(j);
        setCity(j.location || city);
      } catch (e) {
        setWeatherErr(e instanceof Error ? e.message : String(e));
      } finally {
        setWeatherLoading(false);
      }
    }, (error) => {
      setWeatherLoading(false);
      setWeatherErr(`定位失败：${error.message}，请使用备用城市。`);
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30 * 60_000 });
  };

  const fetchModels = async () => {
    setLoading(true);
    setFetchErr(null);
    try {
      const r = await fetch(apiUrl("/api/models"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseURL: baseURL.trim(), apiKey: apiKey.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      const list: string[] = j.models ?? [];
      if (list.length === 0) throw new Error("这个接口没有返回模型列表，请手动输入模型名。");
      setModels(list);
      setManual(false);
      if (!list.includes(model)) setModel(list[0]);
    } catch (e) {
      setFetchErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const voiceSettings: TTSSettings = {
    enabled: ttsEnabled,
    autoPlay: ttsAutoPlay,
    engine: ttsEngine,
    voice: ttsVoice,
    rate: ttsRate,
    pitch: ttsPitch,
    emotionStyle: ttsEmotionStyle,
    moodModulation: ttsMoodModulation,
    fishApiKey,
    fishReferenceId,
    fishModel,
    customBaseURL: customTtsUrl,
    customApiKey: customTtsKey,
    customModel: customTtsModel,
    customVoice: customTtsVoice,
  };

  const updateVoiceSettings = (settings: TTSSettings) => {
    setTtsEnabled(settings.enabled);
    setTtsAutoPlay(settings.autoPlay);
    setTtsEngine(settings.engine);
    setTtsVoice(settings.voice);
    setTtsRate(settings.rate);
    setTtsPitch(settings.pitch);
    setTtsEmotionStyle(settings.emotionStyle);
    setTtsMoodModulation(settings.moodModulation);
    setFishApiKey(settings.fishApiKey ?? "");
    setFishReferenceId(settings.fishReferenceId ?? "");
    setFishModel(settings.fishModel ?? "");
    setCustomTtsUrl(settings.customBaseURL ?? "");
    setCustomTtsKey(settings.customApiKey ?? "");
    setCustomTtsModel(settings.customModel ?? "");
    setCustomTtsVoice(settings.customVoice ?? "");
  };

  const save = () => {
    const visionProvider = {
      enabled: visionEnabled,
      baseURL: visionBaseURL.trim(),
      apiKey: visionApiKey.trim(),
      model: visionModel.trim(),
    };

    if (mode === "custom") {
      setProvider({
        mode,
        baseURL: baseURL.trim(),
        apiKey: apiKey.trim(),
        model: model.trim(),
        visionProvider,
      });
    } else {
      setProvider({
        mode: "default",
        visionProvider,
      });
    }
    setApiBaseUrl(serverUrl);
    setReplyStyle(style);
    setProfile({
      name: name.trim() || "妹妹",
      age: Math.max(18, Math.min(99, Number(age) || 18)),
      birthday,
      userNickname: userNickname.trim() || "哥哥",
      city: city.trim(),
    });
    setWeather(weatherPreview);
    setTtsSettings({
      ...voiceSettings,
      fishApiKey: voiceSettings.fishApiKey?.trim(),
      fishReferenceId: voiceSettings.fishReferenceId?.trim(),
      fishModel: voiceSettings.fishModel?.trim(),
      customBaseURL: voiceSettings.customBaseURL?.trim(),
      customApiKey: voiceSettings.customApiKey?.trim(),
      customModel: voiceSettings.customModel?.trim(),
      customVoice: voiceSettings.customVoice?.trim(),
    });
    onClose();
  };

  return (
    <div className="modal-mask settings-modal-mask" onClick={onClose}>
      <div className="modal settings-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-grab-handle" />
        <div className="settings-header">
          <div>
            <div className="modal-title">⚙️ 应用与伴侣设置</div>
            <div className="settings-header-note">个性角色、高保真语音、天气定位与大模型连接</div>
          </div>
          <button className="settings-close" type="button" onClick={onClose} aria-label="关闭设置">✕</button>
        </div>

        <div className="settings-scroll">
          {/* 1. 角色档案 */}
          <div className="settings-section-card">
            <div className="settings-section-title">
              <span className="title-icon">🌸</span>
              <span>角色档案与称呼</span>
            </div>
            <div className="profile-grid">
              <label className="fld">
                <span>伴侣名字</span>
                <input maxLength={12} value={name} onChange={(e) => setName(e.target.value)} placeholder="未设置时默认：妹妹" />
              </label>
              <label className="fld">
                <span>年龄（仅限成年）</span>
                <input type="number" min={18} max={99} value={age} onChange={(e) => setAge(e.target.value)} />
              </label>
              <label className="fld">
                <span>生日</span>
                <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
              </label>
              <label className="fld">
                <span>她怎么称呼你</span>
                <input maxLength={12} value={userNickname} onChange={(e) => setUserNickname(e.target.value)} placeholder="默认：哥哥" />
              </label>
            </div>
          </div>

          <VoiceSettingsSection
            companionName={name.trim() || "妹妹"}
            userNickname={userNickname.trim() || "哥哥"}
            value={voiceSettings}
            onChange={updateVoiceSettings}
          />
          {/* 3. 伴侣回复方式 */}
          <div className="settings-section-card">
            <div className="settings-section-title">
              <span className="title-icon">💬</span>
              <span>{name || "妹妹"}的回复风格</span>
            </div>
            <div className="style-options">
              {([
                ["daily", "日常陪伴", "短对话为主，偶尔带亲昵动作"],
                ["immersive", "沉浸互动", "台词、细腻动作与心绪描写均衡"],
                ["story", "剧情小说", "更完整的轻小说式沉浸场景"],
              ] as const).map(([value, label, desc]) => (
                <button key={value} type="button" className={`style-option ${style === value ? "sel" : ""}`} onClick={() => setStyle(value)}>
                  <strong>{label}</strong>
                  <span>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. 模型供应商 */}
          <div className="settings-section-card">
            <div className="settings-section-title">
              <span className="title-icon">🧠</span>
              <span>AI 对话模型连接</span>
            </div>

            <div className="opt-cards-group">
              <label className={`opt ${mode === "default" ? "sel" : ""}`}>
                <input type="radio" checked={mode === "default"} onChange={() => setMode("default")} />
                <div>
                  <div className="opt-name">默认内置供应商（Claude）</div>
                  <div className="opt-desc">
                    由后端代理内置驱动；若无 Key 时将自动开启沉浸式「回声体验模式」。
                  </div>
                </div>
              </label>

              <label className={`opt ${mode === "custom" ? "sel" : ""}`}>
                <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} />
                <div>
                  <div className="opt-name">自定义模型接口（DeepSeek / OpenAI / 本地等）</div>
                  <div className="opt-desc">
                    支持 DeepSeek、OpenAI、通义千问、Ollama 等 OpenAI 兼容接口，配置完全保存在本地。
                  </div>
                </div>
              </label>
            </div>

            {mode === "custom" && (
              <div className="custom-fields">
                <label className="fld">
                  <span>接口地址 Base URL</span>
                  <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.deepseek.com 或 https://api.openai.com/v1" />
                </label>
                <label className="fld">
                  <span>API Key</span>
                  <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
                </label>
                <label className="fld">
                  <span>模型名称 Model</span>
                  <div className="models-row">
                    {manual || models.length === 0 ? (
                      <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="deepseek-chat 或 gpt-4o-mini" />
                    ) : (
                      <select value={model} onChange={(e) => setModel(e.target.value)}>
                        {models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      className="mini-btn fetch-models-btn"
                      type="button"
                      disabled={loading || !baseURL.trim() || !apiKey.trim()}
                      onClick={fetchModels}
                    >
                      {loading ? "获取中…" : "获取模型列表"}
                    </button>
                  </div>
                  {fetchErr && <div className="fld-note err">{fetchErr}</div>}
                  {!manual && models.length > 0 && (
                    <button type="button" className="link-like" onClick={() => setManual(true)}>
                      改为手动输入
                    </button>
                  )}
                  {manual && models.length > 0 && (
                    <button type="button" className="link-like" onClick={() => setManual(false)}>
                      从列表选择（{models.length} 个模型）
                    </button>
                  )}
                </label>
              </div>
            )}
          </div>

          {/* 5. 独立视觉看图模型 */}
          <div className="settings-section-card">
            <div className="settings-section-title">
              <span className="title-icon">👁️</span>
              <span>独立看图/视觉识别模型（双模型协同）</span>
            </div>
            <div className="toggle-row">
              <div className="toggle-label-group">
                <strong>启用独立看图模型</strong>
                <div className="fld-note">
                  主模型用纯文本（如 DeepSeek），看图用视觉模型（如 GPT-4o-mini / Qwen-VL）
                </div>
              </div>
              <label className="custom-switch">
                <input
                  type="checkbox"
                  checked={visionEnabled}
                  onChange={(e) => setVisionEnabled(e.target.checked)}
                />
                <span className="switch-slider" />
              </label>
            </div>

            {visionEnabled && (
              <div className="custom-fields" style={{ marginTop: "12px" }}>
                <label className="fld">
                  <span>视觉接口 Base URL</span>
                  <input
                    value={visionBaseURL}
                    onChange={(e) => setVisionBaseURL(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </label>
                <label className="fld">
                  <span>视觉 API Key</span>
                  <input
                    type="password"
                    value={visionApiKey}
                    onChange={(e) => setVisionApiKey(e.target.value)}
                    placeholder="sk-..."
                  />
                </label>
                <label className="fld">
                  <span>视觉模型 Model</span>
                  <input
                    value={visionModel}
                    onChange={(e) => setVisionModel(e.target.value)}
                    placeholder="gpt-4o-mini / qwen-vl-plus / glm-4v"
                  />
                  <div className="fld-note vision-note">
                    💡 运行流程：屏幕截图 ➔ 视觉模型提取代码/游戏活动 ➔ 你的主模型（如 DeepSeek）生成专属人设妹妹台词！
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* 6. 现实天气与定位 */}
          <div className="settings-section-card">
            <div className="settings-section-title">
              <span className="title-icon">🌤️</span>
              <span>现实天气与生活感知</span>
            </div>
            <label className="fld">
              <span>当前位置天气</span>
              <button className="location-btn" type="button" disabled={weatherLoading} onClick={locateWeather}>
                📍 {weatherLoading ? "正在定位中…" : "一键获取当前位置与天气"}
              </button>
              <span className="weather-fallback-label">定位不可用时，可填写备用城市</span>
              <div className="models-row">
                <input value={city} onChange={(e) => { setCity(e.target.value); setWeatherPreview(null); }} placeholder="例如：上海 / 北京 / 广州" />
                <button className="mini-btn" type="button" disabled={weatherLoading || !city.trim()} onClick={refreshWeather}>
                  {weatherLoading ? "查询中…" : "查询天气"}
                </button>
              </div>
              {weatherPreview && (
                <div className="weather-preview">
                  🌤️ {weatherPreview.location} · {weatherPreview.label} · {weatherPreview.temperature}℃（体感 {weatherPreview.apparentTemperature}℃）
                </div>
              )}
              {weatherErr && <div className="fld-note err">{weatherErr}</div>}
            </label>
          </div>

          {/* 7. 账号与云存档 */}
          <div className="settings-section-card">
            <div className="settings-section-title">
              <span className="title-icon">☁️</span>
              <span>账号与云空间</span>
            </div>
            <div className="account-preview-info">
              <span className="account-preview-icon">👤</span>
              <div>
                <div className="account-preview-status">
                  {accountToken ? "✅ 账号已登录 · 专属云空间已开启" : "未登录账号（仅本地单机模式）"}
                </div>
                <div className="fld-note">
                  {accountToken
                    ? "对话记忆与好感度可随时云端备份，云端不保存模型 API Key。"
                    : "登录后可开启云存档备份、跨设备记忆同步并领取 50 心愿星。"}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="open-account-hub-btn"
              onClick={() => {
                if (onOpenAccount) {
                  onClose();
                  onOpenAccount();
                }
              }}
            >
              {accountToken ? "⚙️ 打开账号与云存档管理" : "✨ 登录 / 注册 / 找回密码"}
            </button>
          </div>

          {/* 8. 本地存档与备份 */}
          <div className="settings-section-card">
            <div className="settings-section-title">
              <span className="title-icon">💾</span>
              <span>本地存档与备份导入</span>
            </div>
            <div className="save-actions">
              <button className="mini-btn action-btn-save" type="button" onClick={downloadSave}>📥 导出本地存档</button>
              <label className="mini-btn file-btn action-btn-load">
                📤 导入本地存档
                <input type="file" accept="application/json,.json" onChange={(e) => void loadSave(e.target.files?.[0])} />
              </label>
            </div>
            {saveNotice && <div className="fld-note save-notice">{saveNotice}</div>}
          </div>

          {/* 8.5 专属世界书与深度设定 */}
          {onOpenLorebook && (
            <div className="settings-section-card">
              <div className="settings-section-title">
                <span className="title-icon">📖</span>
                <span>专属世界书与深度记忆 (World Info)</span>
              </div>
              <p className="fld-note" style={{ margin: "0 0 10px" }}>
                管理角色深度记忆、关键词智能触发、常驻设定及酒馆 (SillyTavern) 格式导入导出。
              </p>
              <button
                className="mini-btn"
                type="button"
                style={{
                  background: "linear-gradient(135deg, #ec4899, #f43f5e)",
                  color: "#fff",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "10px",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
                onClick={() => {
                  onClose();
                  onOpenLorebook();
                }}
              >
                <span>📖</span> 打开世界书管理面板
              </button>
            </div>
          )}

          {/* 9. 远程服务器地址 */}
          <div className="settings-section-card">
            <div className="settings-section-title">
              <span className="title-icon">🌐</span>
              <span>远程服务器连接（桌面端 / 多端调用）</span>
            </div>
            <label className="fld">
              <span>远程服务器后端 URL</span>
              <input
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="默认留空（同源服务），如：https://api.yourdomain.com"
              />
              <div className="fld-note">
                💡 桌面客户端或多端使用时，填入您在服务器部署的公网域名或 IP，客户端将全自动连向云端后端！
              </div>
            </label>
          </div>
        </div>

        <div className="modal-actions settings-footer">
          <button className="ghost-btn" type="button" onClick={onClose}>
            取消
          </button>
          <button className="primary-btn" type="button" onClick={save}>
            保存全部设置
          </button>
        </div>
      </div>
    </div>
  );
}
