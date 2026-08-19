import { useState } from "react";
import { useStore } from "@/store/companionStore";
import type { ProviderCfg } from "@/lib/chat";
import type { ReplyStyle } from "@/data/persona";

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const provider = useStore((s) => s.provider);
  const setProvider = useStore((s) => s.setProvider);
  const replyStyle = useStore((s) => s.replyStyle);
  const setReplyStyle = useStore((s) => s.setReplyStyle);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const weather = useStore((s) => s.weather);
  const setWeather = useStore((s) => s.setWeather);

  const [mode, setMode] = useState<ProviderCfg["mode"]>(provider.mode);
  const [baseURL, setBaseURL] = useState(provider.baseURL ?? "https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState(provider.apiKey ?? "");
  const [model, setModel] = useState(provider.model ?? "gpt-4o-mini");

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
  const syncWallet = useStore((s) => s.syncWallet);
  const clearWallet = useStore((s) => s.clearWallet);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountToken, setAccountToken] = useState(() => localStorage.getItem("koko-account-token") || "");
  const [accountNotice, setAccountNotice] = useState<string | null>(null);

  const accountRequest = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(accountToken ? { Authorization: `Bearer ${accountToken}` } : {}), ...init.headers },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  };

  const authenticate = async (kind: "login" | "register") => {
    setAccountNotice(null);
    try {
      const data = await accountRequest(`/api/auth/${kind}`, { method: "POST", body: JSON.stringify({ email: accountEmail, password: accountPassword }) });
      localStorage.setItem("koko-account-token", data.token);
      setAccountToken(data.token);
      await syncWallet();
      setAccountPassword("");
      setAccountNotice(kind === "register" ? "注册成功，已获得初始 50 心愿星。" : "登录成功。");
    } catch (error) { setAccountNotice(error instanceof Error ? error.message : String(error)); }
  };

  const uploadCloud = async () => {
    try { await accountRequest("/api/cloud-save", { method: "PUT", body: JSON.stringify({ payload: exportSave() }) }); setAccountNotice("云存档已更新。"); }
    catch (error) { setAccountNotice(error instanceof Error ? error.message : String(error)); }
  };

  const downloadCloud = async () => {
    if (!confirm("下载云存档会覆盖当前本地进度，但保留 API 设置。确定继续吗？")) return;
    try { const data = await accountRequest("/api/cloud-save"); setAccountNotice(importSave(data.payload) || "云存档已恢复。"); }
    catch (error) { setAccountNotice(error instanceof Error ? error.message : String(error)); }
  };

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
    if (mode === "custom") {
      setProvider({ mode, baseURL: baseURL.trim(), apiKey: apiKey.trim(), model: model.trim() });
    } else {
      setProvider({ mode: "default" });
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
    onClose();
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal settings-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div><div className="modal-title">设置</div><div className="settings-header-note">账号、角色、天气与模型</div></div>
          <button className="settings-close" type="button" onClick={onClose} aria-label="关闭设置">×</button>
        </div>
        <div className="settings-scroll">

        <div className="settings-section-title">账号与云同步</div>
        {accountToken ? (
          <div className="account-box">
            <div className="account-status"><span className="presence-dot" />已登录 · 本地聊天可继续使用</div>
            <div className="fld-note">云端不会保存你的模型 API Key。</div>
            <div className="save-actions">
              <button className="mini-btn" onClick={uploadCloud}>上传当前存档</button>
              <button className="mini-btn" onClick={downloadCloud}>恢复云存档</button>
              <button className="mini-btn danger-mini" onClick={() => { localStorage.removeItem("koko-account-token"); setAccountToken(""); clearWallet(); setAccountNotice("已退出登录，本地聊天仍然保留。"); }}>退出登录</button>
            </div>
          </div>
        ) : (
          <div className="account-box">
            <div className="fld-note">不登录也能聊天；登录用于云存档、跨设备恢复和服务端资产。</div>
            <label className="fld"><span>邮箱</span><input type="email" value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} placeholder="name@example.com" /></label>
            <label className="fld"><span>密码（至少 8 位）</span><input type="password" value={accountPassword} onChange={(e) => setAccountPassword(e.target.value)} /></label>
            <div className="save-actions"><button className="mini-btn" onClick={() => void authenticate("login")}>登录</button><button className="mini-btn" onClick={() => void authenticate("register")}>注册账号</button></div>
          </div>
        )}
        {accountNotice && <div className={`fld-note account-notice ${/失败|错误|不正确|未配置/.test(accountNotice) ? "err" : ""}`}>{accountNotice}</div>}

        <div className="settings-section-title provider-title">角色档案</div>
        <div className="profile-grid">
          <label className="fld"><span>妹妹的名字</span><input maxLength={12} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="fld"><span>年龄（仅限成年）</span><input type="number" min={18} max={99} value={age} onChange={(e) => setAge(e.target.value)} /></label>
          <label className="fld"><span>生日</span><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></label>
          <label className="fld"><span>她怎么称呼你</span><input maxLength={12} value={userNickname} onChange={(e) => setUserNickname(e.target.value)} /></label>
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
