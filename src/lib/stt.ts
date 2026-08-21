/**
 * Speech-to-Text (STT) Manager using Web Speech Recognition API
 */

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

export function isSTTSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export interface STTCallbacks {
  onInterimText?: (text: string) => void;
  onFinalText?: (text: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (errorMsg: string) => void;
}

export class VoiceRecognizer {
  private recognition: ISpeechRecognition | null = null;
  private isListening = false;
  private currentFinalText = "";
  private callbacks: STTCallbacks = {};

  constructor() {
    this.initRecognition();
  }

  private initRecognition() {
    if (!isSTTSupported()) return;
    const SpeechConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechConstructor) return;

    const recog = new SpeechConstructor();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = "zh-CN";

    recog.onstart = () => {
      this.isListening = true;
      this.callbacks.onStart?.();
    };

    recog.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const item = event.results[i];
        if (item.isFinal) {
          this.currentFinalText += item[0].transcript;
        } else {
          interim += item[0].transcript;
        }
      }
      const combined = (this.currentFinalText + interim).trim();
      this.callbacks.onInterimText?.(combined);
    };

    recog.onerror = (event: SpeechRecognitionErrorEvent) => {
      let msg = "语音识别错误";
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        if (
          typeof window !== "undefined" &&
          window.location.protocol === "http:" &&
          window.location.hostname !== "localhost" &&
          window.location.hostname !== "127.0.0.1" &&
          !window.electronAPI?.isElectron
        ) {
          msg = "手机浏览器限制：由于当前使用 HTTP 协议访问，浏览器强制禁用了麦克风权限。请配置 HTTPS 域名或在桌面端使用。";
        } else {
          msg = "未获得麦克风权限，请在浏览器权限设置中允许访问麦克风。";
        }
      } else if (event.error === "no-speech") {
        msg = "未检测到说话声音，请试着靠近麦克风再试一次哦。";
      } else if (event.error === "network") {
        msg = "语音识别服务连接超时。";
      }
      this.callbacks.onError?.(msg);
    };

    recog.onend = () => {
      this.isListening = false;
      const finalResult = this.currentFinalText.trim();
      this.callbacks.onFinalText?.(finalResult);
      this.callbacks.onEnd?.();
    };

    this.recognition = recog;
  }

  public async start(callbacks: STTCallbacks) {
    this.callbacks = callbacks;
    this.currentFinalText = "";

    // 1. Detect HTTP on remote mobile browsers where microphone is strictly blocked
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "http:" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1" &&
      !window.electronAPI?.isElectron
    ) {
      callbacks.onError?.("手机浏览器安全限制：HTTP 访问无法调用麦克风，需要使用 HTTPS 域名访问。");
      return;
    }

    // 2. Proactively trigger browser permission dialog via getUserMedia if supported
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Close tracks immediately to hand over to SpeechRecognition
        stream.getTracks().forEach((track) => track.stop());
      } catch (err: any) {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          callbacks.onError?.("未获得麦克风权限，请在浏览器地址栏或系统设置中允许使用麦克风。");
          return;
        }
      }
    }

    if (!this.recognition) {
      this.initRecognition();
    }
    if (!this.recognition) {
      callbacks.onError?.("当前浏览器不支持原生语音识别，推荐使用 Chrome、Edge 或 Safari 浏览器。");
      return;
    }
    if (this.isListening) {
      this.stop();
    }
    try {
      this.recognition.start();
    } catch (e: any) {
      console.warn("[STT] Start error:", e);
      if (!e.message?.includes("already started")) {
        callbacks.onError?.(e.message || "麦克风启动失败，请检查浏览器权限。");
      }
    }
  }

  public stop() {
    if (!this.recognition || !this.isListening) return;
    try {
      this.recognition.stop();
    } catch (e) {
      console.warn("[STT] Stop error:", e);
    }
  }

  public cancel() {
    if (!this.recognition || !this.isListening) return;
    try {
      this.currentFinalText = "";
      this.recognition.abort();
    } catch (e) {
      console.warn("[STT] Abort error:", e);
    }
  }

  public get listening(): boolean {
    return this.isListening;
  }
}

export const voiceRecognizer = new VoiceRecognizer();
