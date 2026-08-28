import { apiUrl } from "./api";
import { stripReasoningContent } from "./reasoningFilter";

export interface TTSSettings {
  enabled: boolean;
  autoPlay: boolean;
  engine: "edge-tts" | "fish-audio" | "web-speech" | "custom";
  voice: string;
  rate: number; // 0.7 ~ 1.4
  pitch: number; // 0.7 ~ 1.3
  emotionStyle: "auto" | "affectionate" | "cheerful" | "whisper" | "gentle";
  moodModulation: boolean;
  customBaseURL?: string;
  customApiKey?: string;
  customModel?: string;
  customVoice?: string;
  fishApiKey?: string;
  fishReferenceId?: string;
  fishModel?: string;
}

export interface FishVoiceModel {
  id: string;
  title: string;
  description: string;
  modelIds: string[];
}

export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  enabled: true,
  autoPlay: false,
  engine: "edge-tts",
  voice: "zh-CN-XiaoyiNeural",
  rate: 1.0,
  pitch: 1.05,
  emotionStyle: "auto",
  moodModulation: true,
};

export interface PresetVoice {
  id: string;
  name: string;
  description: string;
  tag: string;
  gender: "female" | "male";
  category: "anime" | "gentle" | "dialect" | "japanese" | "boy";
}

export const EMOTION_STYLES = [
  { id: "auto", name: "🤖 智能情绪自适应", desc: "根据可可当前心情(0-100)、作息时段与对话内容实时动态变调" },
  { id: "affectionate", name: "💖 甜美撒娇", desc: "语调温软上扬，充满依恋感与少女感" },
  { id: "cheerful", name: "☀️ 活泼欢快", desc: "语速稍快、语调明朗，元气满满" },
  { id: "whisper", name: "🌙 轻声耳语", desc: "语速放缓、声线轻柔，适合深夜与睡前悄悄话" },
  { id: "gentle", name: "🌸 温柔知心", desc: "舒缓温和，富有生活陪伴感" },
] as const;

export const PRESET_EDGE_VOICES: PresetVoice[] = [
  // 二次元与声优系
  { id: "zh-CN-XiaoyiNeural", name: "晓依", description: "活泼灵动 · 元气少女妹系（推荐）", tag: "二次元元气", gender: "female", category: "anime" },
  { id: "zh-CN-XiaomengNeural", name: "晓梦", description: "软萌轻语 · 二次元治愈萝莉", tag: "萌妹治愈", gender: "female", category: "anime" },
  { id: "zh-CN-XiaoshuangNeural", name: "晓双", description: "呆萌稚嫩 · 幼妹童真甜音", tag: "幼萌妹系", gender: "female", category: "anime" },
  { id: "zh-CN-XiaoxuanNeural", name: "晓萱", description: "清冷傲娇 · 大小姐声线", tag: "傲娇清冷", gender: "female", category: "anime" },
  { id: "zh-CN-XiaohanNeural", name: "晓涵", description: "细腻深情 · 温柔沉浸女友感", tag: "细腻深情", gender: "female", category: "anime" },

  // 温婉与生活陪伴
  { id: "zh-CN-XiaoxiaoNeural", name: "晓晓", description: "温婉亲切 · 知性陪伴邻家大姐姐", tag: "温婉知性", gender: "female", category: "gentle" },
  { id: "zh-TW-HsiaoChenNeural", name: "台湾晓臻", description: "甜美软糯 · 偶像剧娇嗔台音", tag: "软萌撒娇", gender: "female", category: "gentle" },
  { id: "zh-TW-HsiaoYuNeural", name: "台湾晓雨", description: "温柔清澈 · 阳光邻家女孩", tag: "清澈柔和", gender: "female", category: "gentle" },

  // 特色方言与元气
  { id: "zh-CN-Liaoning-XiaobeiNeural", name: "东北小北", description: "东北小北 · 幽默开朗接地气", tag: "元气幽默", gender: "female", category: "dialect" },
  { id: "zh-CN-Shaanxi-XiaoniNeural", name: "陕西晓妮", description: "陕西晓妮 · 娇憨方言声线", tag: "质朴可爱", gender: "female", category: "dialect" },
  { id: "zh-HK-HiuMaanNeural", name: "香港晓曼", description: "香港晓曼 · 港风甜美粤语", tag: "港风粤语", gender: "female", category: "dialect" },

  // 日语正统动漫声优（仅限日语/读中文为日文读音）
  { id: "ja-JP-NanamiNeural", name: "七海 (Nanami · 日语声优)", description: "日漫元气声优音（读中文会按日文发音）", tag: "日语原声", gender: "female", category: "japanese" },
  { id: "ja-JP-AoiNeural", name: "葵 (Aoi · 日语声优)", description: "日漫软萌女仆妹系音（读中文会按日文发音）", tag: "日语原声", gender: "female", category: "japanese" },
  { id: "ja-JP-MayuNeural", name: "真由 (Mayu · 日语声优)", description: "日漫清冷傲娇大小姐（读中文会按日文发音）", tag: "日语原声", gender: "female", category: "japanese" },

  // 阳光少年
  { id: "zh-CN-YunxiNeural", name: "云希", description: "云希少年 · 阳光清爽正太音", tag: "阳光少年", gender: "male", category: "boy" },
];

/**
 * Filter out stage directions, brackets, actions, and formatting to speak natural dialogue.
 */
export function cleanTextForSpeech(raw: string): string {
  if (!raw) return "";
  let text = stripReasoningContent(raw);

  // 1. Remove bracketed actions: （...）, (...), 【...】, [...], *...*, 「...」
  text = text.replace(/（[^）]*）/g, " ");
  text = text.replace(/\([^)]*\)/g, " ");
  text = text.replace(/【[^】]*】/g, " ");
  text = text.replace(/\[[^\]]*\]/g, " ");
  text = text.replace(/\*[^*]+\*/g, " ");
  text = text.replace(/·[^·]+·/g, " ");

  // 2. Remove URLs, emojis, and symbols
  text = text.replace(/https?:\/\/\S+/g, " ");
  text = text.replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, " ");
  text = text.replace(/[✦♥★☆❀✿✨💖🌸🥛🎀]/g, " ");

  // 3. Remove Markdown formatting
  text = text.replace(/`{1,3}[^`]+`{1,3}/g, " ");
  text = text.replace(/[#*_~>]/g, " ");

  // 4. Normalize whitespace and punctuation
  text = text.replace(/\s+/g, " ").trim();

  // If after stripping it's too short (e.g. was only a stage action), return original stripped
  if (!text || text.length === 0) {
    const backup = raw.replace(/[（）()【】\[\]*✦♥★☆❀✿✨💖🌸🥛🎀]/g, "").trim();
    return backup.slice(0, 200);
  }

  return text.slice(0, 600);
}

export function calculateModulation(
  mood: number,
  hour: number,
  baseRate: number,
  basePitch: number,
  emotionStyle: TTSSettings["emotionStyle"] = "auto",
  enabled = true,
): { rate: number; pitch: number } {
  if (!enabled) return { rate: baseRate, pitch: basePitch };
  let rateMult = 1.0;
  let pitchMult = 1.0;

  if (emotionStyle === "affectionate") {
    pitchMult = 1.08;
    rateMult = 0.98;
  } else if (emotionStyle === "cheerful") {
    pitchMult = 1.10;
    rateMult = 1.06;
  } else if (emotionStyle === "whisper") {
    pitchMult = 0.95;
    rateMult = 0.90;
  } else if (emotionStyle === "gentle") {
    pitchMult = 1.00;
    rateMult = 0.95;
  } else {
    // auto mode based on mood & hour
    if (hour >= 23 || hour < 6) {
      rateMult *= 0.90;
      pitchMult *= 0.94;
    } else if (mood >= 75) {
      rateMult *= 1.05;
      pitchMult *= 1.08;
    } else if (mood < 38) {
      rateMult *= 0.93;
      pitchMult *= 0.95;
    }
  }

  return {
    rate: Math.max(0.6, Math.min(1.8, Number((baseRate * rateMult).toFixed(2)))),
    pitch: Math.max(0.6, Math.min(1.5, Number((basePitch * pitchMult).toFixed(2)))),
  };
}

class TTSPlayer {
  private currentAudio: HTMLAudioElement | null = null;
  private currentBlobUrl: string | null = null;
  private currentSpeakingId: string | null = null;
  private listeners: Set<(speakingId: string | null) => void> = new Set();

  public subscribe(fn: (speakingId: string | null) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(id: string | null) {
    this.currentSpeakingId = id;
    for (const fn of this.listeners) {
      fn(id);
    }
  }

  public getSpeakingId(): string | null {
    return this.currentSpeakingId;
  }

  public stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
    }
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    this.notify(null);
  }

  public async play(options: {
    messageId: string;
    text: string;
    settings: TTSSettings;
    mood?: number;
    hour?: number;
    fallbackToWebSpeech?: boolean;
  }): Promise<void> {
    const {
      messageId,
      text,
      settings,
      mood = 60,
      hour = new Date().getHours(),
      fallbackToWebSpeech = true,
    } = options;

    if (!settings.enabled) return;
    const speechText = cleanTextForSpeech(text);
    if (!speechText) return;

    this.stop();
    this.notify(messageId);

    const { rate, pitch } = calculateModulation(
      mood,
      hour,
      settings.rate,
      settings.pitch,
      settings.emotionStyle || "auto",
      settings.moodModulation,
    );

    // 1. Web Speech API engine
    if (settings.engine === "web-speech") {
      this.playWebSpeech(messageId, speechText, rate, pitch);
      return;
    }

    // 2. Edge-TTS or Custom TTS via /api/tts
    try {
      const payload: Record<string, any> = {
        text: speechText,
        voice: settings.voice || "zh-CN-XiaoyiNeural",
        rate,
        pitch,
        engine: settings.engine,
      };


      if (settings.engine === "fish-audio") {
        payload.fishConfig = {
          apiKey: settings.fishApiKey?.trim(),
          referenceId: settings.fishReferenceId?.trim(),
          model: settings.fishModel?.trim().startsWith("fishaudio-")
            ? settings.fishModel.trim()
            : "fishaudio-s21pro-flash",
        };
      }
      if (settings.engine === "custom" && settings.customBaseURL) {
        payload.customConfig = {
          baseURL: settings.customBaseURL,
          apiKey: settings.customApiKey,
          model: settings.customModel || "tts-1",
          voice: settings.customVoice || "alloy",
        };
      }

      const response = await fetch(apiUrl("/api/tts"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `TTS 状态异常 (${response.status})`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      this.currentBlobUrl = blobUrl;

      const audio = new Audio(blobUrl);
      this.currentAudio = audio;

      audio.onended = () => {
        if (this.currentSpeakingId === messageId) {
          this.stop();
        }
      };

      audio.onerror = () => {
        // Fallback to Web Speech if audio playback fails
        if (this.currentSpeakingId === messageId) {
          this.playWebSpeech(messageId, speechText, rate, pitch);
        }
      };

      await audio.play();
    } catch (err) {
      this.notify(null);
      if (!fallbackToWebSpeech) throw err;
      console.warn("[TTS] 云端语音合成失败，尝试回退至浏览器内置语音：", err);
      if (this.currentSpeakingId === messageId) {
        this.playWebSpeech(messageId, speechText, rate, pitch);
      }
    }
  }

  private playWebSpeech(messageId: string, text: string, rate: number, pitch: number) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      this.notify(null);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "zh-CN";
      utterance.rate = Math.max(0.6, Math.min(1.8, rate));
      utterance.pitch = Math.max(0.6, Math.min(1.5, pitch));

      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(
        (v) =>
          (v.lang.startsWith("zh") || v.lang.startsWith("cmn") || v.lang.startsWith("ja")) &&
          (v.name.includes("Xiaoxiao") ||
            v.name.includes("Xiaoyi") ||
            v.name.includes("Female") ||
            v.name.includes("Tingting") ||
            v.name.includes("Nanami") ||
            v.name.includes("晓") ||
            v.name.includes("婷婷")),
      ) || voices.find((v) => v.lang.startsWith("zh") || v.lang.startsWith("cmn"));

      if (zhVoice) {
        utterance.voice = zhVoice;
      }

      utterance.onend = () => {
        if (this.currentSpeakingId === messageId) {
          this.notify(null);
        }
      };

      utterance.onerror = () => {
        if (this.currentSpeakingId === messageId) {
          this.notify(null);
        }
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      this.notify(null);
    }
  }
}

export const ttsPlayer = new TTSPlayer();
