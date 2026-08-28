import { useState } from "react";
import { apiUrl } from "@/lib/api";
import {
  EMOTION_STYLES,
  PRESET_EDGE_VOICES,
  ttsPlayer,
  type FishVoiceModel,
  type TTSSettings,
} from "@/lib/tts";

interface VoiceSettingsSectionProps {
  companionName: string;
  userNickname: string;
  value: TTSSettings;
  onChange: (settings: TTSSettings) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFishVoiceModel(value: unknown): value is FishVoiceModel {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.description === "string"
    && Array.isArray(value.modelIds)
    && value.modelIds.every((modelId) => typeof modelId === "string");
}

function readResponseError(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.error === "string" ? value.error : fallback;
}

export function VoiceSettingsSection({
  companionName,
  userNickname,
  value,
  onChange,
}: VoiceSettingsSectionProps) {
  const [fishModels, setFishModels] = useState<FishVoiceModel[]>([]);
  const [fishSearchQuery, setFishSearchQuery] = useState("");
  const [fishLoading, setFishLoading] = useState(false);
  const [fishFetchError, setFishFetchError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const update = <Key extends keyof TTSSettings>(key: Key, nextValue: TTSSettings[Key]) => {
    onChange({ ...value, [key]: nextValue });
  };

  const fetchFishVoiceModels = async () => {
    setFishLoading(true);
    setFishFetchError(null);
    try {
      const response = await fetch(apiUrl("/api/fish/models"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: value.fishApiKey?.trim(),
          query: fishSearchQuery.trim(),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error(readResponseError(payload, `HTTP ${response.status}`));

      const models = isRecord(payload) && Array.isArray(payload.models)
        ? payload.models.filter(isFishVoiceModel)
        : [];
      if (models.length === 0) {
        throw new Error("没有匹配的可用音色，请清空搜索词重试，或直接填写 Voice ID。");
      }

      setFishModels(models);
      const selected = models.find((model) => model.id === value.fishReferenceId) ?? models[0];
      onChange({
        ...value,
        fishReferenceId: value.fishReferenceId || selected.id,
        fishModel: selected.modelIds.includes(value.fishModel || "")
          ? value.fishModel
          : selected.modelIds[0] || value.fishModel,
      });
    } catch (error) {
      setFishFetchError(error instanceof Error ? error.message : String(error));
    } finally {
      setFishLoading(false);
    }
  };

  const testVoice = async () => {
    setTesting(true);
    setTestError(null);
    try {
      await ttsPlayer.play({
        messageId: "test-voice-preview",
        text: `（开心地笑了笑）${userNickname}，听得到${companionName}的声音吗？今天也要一直陪着我哦~`,
        settings: { ...value, enabled: true, autoPlay: false },
        mood: 75,
        hour: new Date().getHours(),
        fallbackToWebSpeech: false,
      });
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "语音试听失败。");
    } finally {
      setTesting(false);
    }
  };

  const selectedFishModelIds = fishModels
    .find((model) => model.id === value.fishReferenceId)
    ?.modelIds ?? [];

  return (
    <div className="settings-section-card">
      <div className="settings-section-title">
        <span className="title-icon">🎙️</span>
        <span>声音与语音播报 (TTS)</span>
      </div>

      <div className="toggle-row">
        <div className="toggle-label-group">
          <strong>开启伴侣语音</strong>
          <div className="fld-note">允许点击聊天气泡播放高保真语音</div>
        </div>
        <label className="custom-switch">
          <input type="checkbox" checked={value.enabled} onChange={(event) => update("enabled", event.target.checked)} />
          <span className="switch-slider" />
        </label>
      </div>

      {value.enabled && (
        <div className="tts-expanded-settings">
          <div className="toggle-row">
            <div className="toggle-label-group">
              <strong>自动朗读回复</strong>
              <div className="fld-note">{companionName}回复完成后自动播报语音</div>
            </div>
            <label className="custom-switch">
              <input type="checkbox" checked={value.autoPlay} onChange={(event) => update("autoPlay", event.target.checked)} />
              <span className="switch-slider" />
            </label>
          </div>

          <label className="fld">
            <span>语音引擎</span>
            <select value={value.engine} onChange={(event) => update("engine", event.target.value as TTSSettings["engine"])}>
              <option value="edge-tts">极清神经网络语音 (Edge Neural · 免Key高保真)</option>
              <option value="fish-audio">🐟 Fish Audio 官方二次元声优引擎</option>
              <option value="web-speech">浏览器本地语音 (Web Speech · 离线零开销)</option>
              <option value="custom">自定义 TTS 接口 (OpenAI / GPT-SoVITS)</option>
            </select>
          </label>

          {value.engine === "edge-tts" && (
            <label className="fld">
              <span>角色音色（二次元与声优库）</span>
              <select value={value.voice} onChange={(event) => update("voice", event.target.value)}>
                {[
                  ["anime", "🌸 二次元与声优系"],
                  ["gentle", "☕ 温婉生活感伴侣"],
                  ["dialect", "🎭 特色方言与元气"],
                  ["japanese", "🇯🇵 日语正统动漫声优"],
                  ["boy", "☀️ 阳光少年"],
                ].map(([category, label]) => (
                  <optgroup key={category} label={label}>
                    {PRESET_EDGE_VOICES.filter((voice) => voice.category === category).map((voice) => (
                      <option key={voice.id} value={voice.id}>{voice.name} · {voice.description}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}

          <label className="fld">
            <span>情感表达模式</span>
            <select value={value.emotionStyle} onChange={(event) => update("emotionStyle", event.target.value as TTSSettings["emotionStyle"])}>
              {EMOTION_STYLES.map((style) => (
                <option key={style.id} value={style.id}>{style.name} — {style.desc}</option>
              ))}
            </select>
          </label>

          <div className="toggle-row">
            <div className="toggle-label-group">
              <strong>情绪与时段动态变调</strong>
              <div className="fld-note">开心时语调轻快，深夜困倦时语速放缓</div>
            </div>
            <label className="custom-switch">
              <input type="checkbox" checked={value.moodModulation} onChange={(event) => update("moodModulation", event.target.checked)} />
              <span className="switch-slider" />
            </label>
          </div>

          {value.engine === "fish-audio" && (
            <div className="custom-fields fish-audio-fields">
              <label className="fld">
                <span>Fish Audio API Key</span>
                <input type="password" value={value.fishApiKey ?? ""} onChange={(event) => update("fishApiKey", event.target.value)} placeholder="在 Fish Audio 账户设置中创建的 API Key" />
                <div className="fld-note">
                  💡 打开 <a className="settings-inline-link" href="https://fishaudio.org/zh/account?section=api" target="_blank" rel="noreferrer">Fish Audio API 设置</a> 创建密钥。
                </div>
              </label>

              <label className="fld">
                <span>获取当前账号可用的 Fish Audio 音色</span>
                <div className="models-row">
                  <input value={fishSearchQuery} onChange={(event) => setFishSearchQuery(event.target.value)} placeholder="可选筛选词；留空显示全部可用音色" />
                  <button className="mini-btn fetch-models-btn" type="button" disabled={fishLoading || !value.fishApiKey?.trim()} onClick={fetchFishVoiceModels}>
                    {fishLoading ? "拉取中…" : "🔍 获取音色列表"}
                  </button>
                </div>
                {fishFetchError && <div className="fld-note err">{fishFetchError}</div>}
              </label>

              {fishModels.length > 0 && (
                <label className="fld">
                  <span>选择已获取的音色模型（共 {fishModels.length} 个）</span>
                  <select
                    value={value.fishReferenceId ?? ""}
                    onChange={(event) => {
                      const selected = fishModels.find((model) => model.id === event.target.value);
                      onChange({
                        ...value,
                        fishReferenceId: event.target.value,
                        fishModel: selected?.modelIds[0] || value.fishModel,
                      });
                    }}
                  >
                    {fishModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.title} {model.description ? `(${model.description.slice(0, 30)}…)` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="fld">
                <span>音色 Voice ID</span>
                <input value={value.fishReferenceId ?? ""} onChange={(event) => update("fishReferenceId", event.target.value)} placeholder="留空时使用 Fish Audio 官方测试音色" />
              </label>

              <label className="fld">
                <span>TTS 模型</span>
                <select value={value.fishModel ?? ""} onChange={(event) => update("fishModel", event.target.value)}>
                  {Array.from(new Set([value.fishModel, ...selectedFishModelIds])).filter(Boolean).map((modelId) => (
                    <option key={modelId} value={modelId}>{modelId}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {value.engine === "custom" && (
            <div className="custom-fields">
              <label className="fld">
                <span>TTS 接口地址 (Base URL)</span>
                <input value={value.customBaseURL ?? ""} onChange={(event) => update("customBaseURL", event.target.value)} placeholder="https://api.openai.com/v1 或 http://127.0.0.1:9880" />
              </label>
              <label className="fld">
                <span>API Key (可选)</span>
                <input type="password" value={value.customApiKey ?? ""} onChange={(event) => update("customApiKey", event.target.value)} placeholder="sk-..." />
              </label>
              <div className="profile-grid">
                <label className="fld">
                  <span>模型名 Model</span>
                  <input value={value.customModel ?? ""} onChange={(event) => update("customModel", event.target.value)} placeholder="tts-1" />
                </label>
                <label className="fld">
                  <span>音色 Voice</span>
                  <input value={value.customVoice ?? ""} onChange={(event) => update("customVoice", event.target.value)} placeholder="alloy / nova" />
                </label>
              </div>
            </div>
          )}

          <div className="profile-grid range-grid">
            <label className="fld">
              <div className="range-title-row"><span>语速</span><span className="range-val-badge">{value.rate.toFixed(2)}x</span></div>
              <input className="custom-slider" type="range" min="0.7" max="1.4" step="0.05" value={value.rate} onChange={(event) => update("rate", Number(event.target.value))} />
            </label>
            <label className="fld">
              <div className="range-title-row"><span>语调</span><span className="range-val-badge">{value.pitch.toFixed(2)}x</span></div>
              <input className="custom-slider" type="range" min="0.7" max="1.3" step="0.05" value={value.pitch} onChange={(event) => update("pitch", Number(event.target.value))} />
            </label>
          </div>

          <div className="voice-test-row">
            <button className="test-voice-btn" type="button" disabled={testing} onClick={testVoice}>
              {testing ? "正在合成音频…" : `🎧 试听${companionName}的声音`}
            </button>
          </div>
          {testError && <div className="fld-note err">{testError}</div>}
        </div>
      )}
    </div>
  );
}
