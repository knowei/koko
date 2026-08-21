import { useState } from "react";
import { useStore } from "@/store/companionStore";
import type { ProviderCfg } from "@/lib/chat";
import type { ReplyStyle } from "@/data/persona";
import { EMOTION_STYLES, PRESET_EDGE_VOICES, ttsPlayer, type TTSSettings } from "@/lib/tts";

export function SettingsPanel({ onClose, onOpenAccount }: { onClose: () => void; onOpenAccount?: () => void }) {
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
  const [ttsTesting, setTtsTesting] = useState(false);

  const downloadSave = () => {
    const blob = new Blob([JSON.stringify(exportSave(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `koko-save-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setSaveNotice("存档已导出；API Key 未包含在文件中。 ");
  };

  const loadSave = async (file?: File) => {
    if (!file || !confirm("导入会覆盖当前聊天、关系、积分、档案和记忆，但保留 API 设置。确定继续吗？")) return;
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
      const r = await fetch(`/api/weather?city=${encodeURIComponent(value)}`);
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
    if (!navigator.geolocation) { setWeatherErr("当前浏览器不支持定位，请使用城市备用设置。"); return; }
    setWeatherLoading(true); setWeatherErr(null);
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const r = await fetch(`/api/weather?lat=${position.coords.latitude}&lon=${position.coords.longitude}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        setWeatherPreview(j);
      } catch (error) { setWeatherErr(error instanceof Error ? error.message : String(error)); }
      finally { setWeatherLoading(false); }
    }, (error) => {
      setWeatherLoading(false);
      setWeatherErr(error.code === error.PERMISSION_DENIED ? "定位权限被拒绝，可在浏览器地址栏重新允许，或填写备用城市。" : "暂时无法获取当前位置。");
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30 * 60_000 });
  };

  const fetchModels = async () => {
    setLoading(true);
    setFetchErr(null);
    try {
      const r = await fetch("/api/models", {
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
    setReplyStyle(style);
    setProfile({
      name: name.trim() || "可可",
      age: Math.max(18, Math.min(99, Number(age) || 18)),
      birthday,
      userNickname: userNickname.trim() || "哥哥",
      city: city.trim(),
    });
    setWeather(weatherPreview);
    setTtsSettings({
      enabled: ttsEnabled,
      autoPlay: ttsAutoPlay,
      engine: ttsEngine,
      voice: ttsVoice,
      rate: ttsRate,
      pitch: ttsPitch,
      emotionStyle: ttsEmotionStyle,
      moodModulation: ttsMoodModulation,
      customBaseURL: customTtsUrl.trim(),
      customApiKey: customTtsKey.trim(),
      customModel: customTtsModel.trim(),
      customVoice: customTtsVoice.trim(),
    });
    onClose();
  };

  const testVoice = async () => {
    setTtsTesting(true);
    try {
      await ttsPlayer.play({
        messageId: "test-voice-preview",
        text: `（开心地笑了笑）${userNickname}，听得到${name}的声音吗？今天也要一直陪着我哦~`,
        settings: {
          enabled: true,
          autoPlay: false,
          engine: ttsEngine,
          voice: ttsVoice,
          rate: ttsRate,
          pitch: ttsPitch,
          emotionStyle: ttsEmotionStyle,
          moodModulation: ttsMoodModulation,
          customBaseURL: customTtsUrl.trim(),
          customApiKey: customTtsKey.trim(),
          customModel: customTtsModel.trim(),
          customVoice: customTtsVoice.trim(),
        },
        mood: 75,
        hour: new Date().getHours(),
      });
    } finally {
      setTtsTesting(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal settings-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div><div className="modal-title">设置</div><div className="settings-header-note">角色、声音、天气、账号与模型</div></div>
          <button className="settings-close" type="button" onClick={onClose} aria-label="关闭设置">×</button>
        </div>
        <div className="settings-scroll">

        <div className="settings-section-title">角色档案</div>
        <div className="profile-grid">
          <label className="fld"><span>妹妹的名字</span><input maxLength={12} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="fld"><span>年龄（仅限成年）</span><input type="number" min={18} max={99} value={age} onChange={(e) => setAge(e.target.value)} /></label>
          <label className="fld"><span>生日</span><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></label>
          <label className="fld"><span>她怎么称呼你</span><input maxLength={12} value={userNickname} onChange={(e) => setUserNickname(e.target.value)} /></label>
        </div>

        <div className="settings-section-title provider-title">声音与语音</div>
        <div className="account-box tts-settings-box">
          <div className="toggle-row">
            <div>
              <strong>开启伴侣语音</strong>
              <div className="fld-note">允许点击气泡播放语音</div>
            </div>
            <input type="checkbox" checked={ttsEnabled} onChange={(e) => setTtsEnabled(e.target.checked)} />
          </div>

          {ttsEnabled && (
            <>
              <div className="toggle-row">
                <div>
                  <strong>自动朗读回复</strong>
                  <div className="fld-note">{name}回复完成后自动播报</div>
                </div>
                <input type="checkbox" checked={ttsAutoPlay} onChange={(e) => setTtsAutoPlay(e.target.checked)} />
              </div>

              <label className="fld">
                <span>语音引擎</span>
                <select value={ttsEngine} onChange={(e) => setTtsEngine(e.target.value as any)}>
                  <option value="edge-tts">极清神经网络语音 (Edge Neural · 免Key高保真)</option>
                  <option value="web-speech">浏览器本地语音 (Web Speech · 离线零开销)</option>
                  <option value="custom">自定义 TTS 接口 (OpenAI / GPT-SoVITS)</option>
                </select>
              </label>

              {ttsEngine === "edge-tts" && (
                <label className="fld">
                  <span>角色音色（二次元与声优库）</span>
                  <select value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)}>
                    <optgroup label="🌸 二次元与声优系">
                      {PRESET_EDGE_VOICES.filter((v) => v.category === "anime").map((v) => (
                        <option key={v.id} value={v.id}>{v.name} · {v.description}</option>
                      ))}
                    </optgroup>
                    <optgroup label="☕ 温婉生活感伴侣">
                      {PRESET_EDGE_VOICES.filter((v) => v.category === "gentle").map((v) => (
                        <option key={v.id} value={v.id}>{v.name} · {v.description}</option>
                      ))}
                    </optgroup>
                    <optgroup label="🎭 特色方言与元气">
                      {PRESET_EDGE_VOICES.filter((v) => v.category === "dialect").map((v) => (
                        <option key={v.id} value={v.id}>{v.name} · {v.description}</option>
                      ))}
                    </optgroup>
                    <optgroup label="🇯🇵 日语正统动漫声优">
                      {PRESET_EDGE_VOICES.filter((v) => v.category === "japanese").map((v) => (
                        <option key={v.id} value={v.id}>{v.name} · {v.description}</option>
                      ))}
                    </optgroup>
                    <optgroup label="☀️ 阳光少年">
                      {PRESET_EDGE_VOICES.filter((v) => v.category === "boy").map((v) => (
                        <option key={v.id} value={v.id}>{v.name} · {v.description}</option>
                      ))}
                    </optgroup>
                  </select>
                </label>
              )}

              <label className="fld">
                <span>情感表达模式</span>
                <select value={ttsEmotionStyle} onChange={(e) => setTtsEmotionStyle(e.target.value as any)}>
                  {EMOTION_STYLES.map((st) => (
                    <option key={st.id} value={st.id}>{st.name} — {st.desc}</option>
                  ))}
                </select>
              </label>

              <div className="toggle-row">
                <div>
                  <strong>情绪与时段动态变调</strong>
                  <div className="fld-note">开心时语调轻快，深夜困倦时语速放缓</div>
                </div>
                <input type="checkbox" checked={ttsMoodModulation} onChange={(e) => setTtsMoodModulation(e.target.checked)} />
              </div>

              {ttsEngine === "custom" && (
                <div className="custom-fields" style={{ marginTop: "6px" }}>
                  <label className="fld">
                    <span>TTS 接口地址 (Base URL)</span>
                    <input value={customTtsUrl} onChange={(e) => setCustomTtsUrl(e.target.value)} placeholder="https://api.openai.com/v1 或 http://127.0.0.1:9880" />
                  </label>
                  <label className="fld">
                    <span>API Key (可选)</span>
                    <input type="password" value={customTtsKey} onChange={(e) => setCustomTtsKey(e.target.value)} placeholder="sk-..." />
                  </label>
                  <div className="profile-grid">
                    <label className="fld">
                      <span>模型名 Model</span>
                      <input value={customTtsModel} onChange={(e) => setCustomTtsModel(e.target.value)} placeholder="tts-1" />
                    </label>
                    <label className="fld">
                      <span>音色 Voice</span>
                      <input value={customTtsVoice} onChange={(e) => setCustomTtsVoice(e.target.value)} placeholder="alloy / nova" />
                    </label>
                  </div>
                </div>
              )}

              <div className="profile-grid">
                <label className="fld">
                  <span>语速 ({ttsRate.toFixed(2)}x)</span>
                  <input type="range" min="0.7" max="1.4" step="0.05" value={ttsRate} onChange={(e) => setTtsRate(Number(e.target.value))} />
                </label>
                <label className="fld">
                  <span>语调 ({ttsPitch.toFixed(2)}x)</span>
                  <input type="range" min="0.7" max="1.3" step="0.05" value={ttsPitch} onChange={(e) => setTtsPitch(Number(e.target.value))} />
                </label>
              </div>

              <div className="save-actions" style={{ marginTop: "10px" }}>
                <button className="mini-btn" type="button" disabled={ttsTesting} onClick={testVoice}>
                  {ttsTesting ? "正在合成…" : `🎧 试听${name}的声音`}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="settings-section-title provider-title">现实天气</div>
        <label className="fld">
          <span>当前位置天气</span>
          <button className="location-btn" type="button" disabled={weatherLoading} onClick={locateWeather}>📍 {weatherLoading ? "定位中…" : "获取当前位置与天气"}</button>
          <span className="weather-fallback-label">定位不可用时，可填写备用城市</span>
          <div className="models-row">
            <input value={city} onChange={(e) => { setCity(e.target.value); setWeatherPreview(null); }} placeholder="例如：上海" />
            <button className="mini-btn" disabled={weatherLoading || !city.trim()} onClick={refreshWeather}>
              {weatherLoading ? "获取中…" : "获取天气"}
            </button>
          </div>
          {weatherPreview && <div className="weather-preview">{weatherPreview.location} · {weatherPreview.label} · {weatherPreview.temperature}℃（体感 {weatherPreview.apparentTemperature}℃）</div>}
          {weatherErr && <div className="fld-note err">{weatherErr}</div>}
        </label>

        <div className="settings-section-title provider-title">账号与云同步</div>
        <div className="account-box-preview">
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

        <div className="settings-section-title provider-title">本地存档</div>
        <div className="save-actions">
          <button className="mini-btn" onClick={downloadSave}>导出存档</button>
          <label className="mini-btn file-btn">导入存档<input type="file" accept="application/json,.json" onChange={(e) => void loadSave(e.target.files?.[0])} /></label>
        </div>
        {saveNotice && <div className="fld-note">{saveNotice}</div>}

        <div className="settings-section-title">可可的回复方式</div>
        <div className="style-options">
          {([
            ["daily", "日常", "短对话为主，偶尔有动作"],
            ["immersive", "沉浸", "台词、动作与心理描写均衡"],
            ["story", "剧情", "更完整的轻小说式场景"],
          ] as const).map(([value, label, desc]) => (
            <button key={value} className={`style-option ${style === value ? "sel" : ""}`} onClick={() => setStyle(value)}>
              <strong>{label}</strong><span>{desc}</span>
            </button>
          ))}
        </div>

        <div className="settings-section-title provider-title">模型供应商</div>

        <label className={`opt ${mode === "default" ? "sel" : ""}`}>
          <input type="radio" checked={mode === "default"} onChange={() => setMode("default")} />
          <div>
            <div className="opt-name">默认（我们的 Claude）</div>
            <div className="opt-desc">
              走后端内置的 Anthropic Claude（claude-opus-4-7）。需要在后端 .env 里配好
              ANTHROPIC_API_KEY；没配也能用「回声模式」先体验界面。
            </div>
          </div>
        </label>

        <label className={`opt ${mode === "custom" ? "sel" : ""}`}>
          <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} />
          <div>
            <div className="opt-name">自定义（用你自己的 Key）</div>
            <div className="opt-desc">
              兼容 OpenAI 格式的接口（OpenAI / DeepSeek / 通义 / 本地 Ollama 等），填地址、Key、模型名。
              信息只存在你自己的浏览器里。
            </div>
          </div>
        </label>

        {mode === "custom" && (
          <div className="custom-fields">
            <label className="fld">
              <span>接口地址 Base URL</span>
              <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" />
            </label>
            <label className="fld">
              <span>API Key</span>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
            </label>
            <label className="fld">
              <span>模型 Model</span>
              <div className="models-row">
                {manual || models.length === 0 ? (
                  <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
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
                  className="mini-btn"
                  disabled={loading || !baseURL.trim() || !apiKey.trim()}
                  onClick={fetchModels}
                >
                  {loading ? "获取中…" : "获取模型列表"}
                </button>
              </div>
              {fetchErr && <div className="fld-note err">{fetchErr}</div>}
              {!manual && models.length > 0 && (
                <button className="link-like" onClick={() => setManual(true)}>
                  改为手动输入
                </button>
              )}
              {manual && models.length > 0 && (
                <button className="link-like" onClick={() => setManual(false)}>
                  从列表选择（{models.length} 个模型）
                </button>
              )}
            </label>
          </div>
        )}

        <div className="settings-section-title provider-title">👁️ 独立看图/视觉识别模型（双模型协同）</div>
        <div className="account-box">
          <div className="toggle-row">
            <div>
              <strong>启用独立看图模型</strong>
              <div className="fld-note">
                主模型用纯文本（如 DeepSeek / Qwen-Chat），看图用视觉模型（如 GPT-4o-mini / Qwen-VL / GLM-4V）
              </div>
            </div>
            <input
              type="checkbox"
              checked={visionEnabled}
              onChange={(e) => setVisionEnabled(e.target.checked)}
            />
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
                <div className="fld-note" style={{ color: "var(--pink)" }}>
                  💡 运行流程：屏幕截图 ➔ 视觉模型提取代码/游戏活动 ➔ 你的主模型（如 DeepSeek）生成专属人设妹妹台词！
                </div>
              </label>
            </div>
          )}
        </div>

        </div>
        <div className="modal-actions settings-footer">
          <button className="ghost-btn" onClick={onClose}>
            取消
          </button>
          <button className="primary-btn" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
