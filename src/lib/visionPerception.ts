import { apiUrl } from "./api";

/**
 * Screen & Game Vision Perception Manager
 */

export interface VisionCommentResult {
  commentary: string;
  expression: "smile" | "blush" | "shy" | "pout" | "sleepy" | "surprised";
  sceneType: "game" | "coding" | "browsing" | "video" | "idle" | "other";
}

export type VisionActivityType = "game" | "coding" | "browsing" | "horror" | "auto";

interface FrameAnalysis {
  signature: number[];
  luminance: number;
}

export class ScreenVisionManager {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private autoPatrolTimer: number | null = null;
  private isProcessing = false;
  private previousFrame: FrameAnalysis | null = null;
  private lastModelRequestAt = 0;
  private lastSpikeAt = 0;
  private lastCommentary = "";

  public isSharing(): boolean {
    if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
      return true;
    }
    return !!this.stream && this.stream.active;
  }

  public async startScreenSharing(): Promise<boolean> {
    if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
      return true;
    }

    if (typeof window === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("当前浏览器不支持屏幕捕获功能，推荐使用 Chrome、Edge 浏览器。");
    }

    try {
      if (this.stream) {
        this.stopScreenSharing();
      }

      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
        },
        audio: false,
      });

      // Handle user stopping screen share from browser system banner
      this.stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        this.stopScreenSharing();
      });

      const video = document.createElement("video");
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = this.stream;
      await video.play().catch(() => {});
      this.videoElement = video;

      return true;
    } catch (e: any) {
      if (e.name === "NotAllowedError" || e.message?.includes("Permission denied")) {
        throw new Error("已取消屏幕/游戏窗口共享。");
      }
      throw e;
    }
  }

  public stopScreenSharing() {
    if (this.autoPatrolTimer) {
      window.clearInterval(this.autoPatrolTimer);
      this.autoPatrolTimer = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  public captureCurrentFrame(maxWidth = 640, maxHeight = 640, quality = 0.72): string | null {
    if (!this.videoElement || !this.stream?.active) {
      return null;
    }

    const video = this.videoElement;
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (!width || !height) return null;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", quality);
  }

  public async requestComment(
    providerCfg: unknown,
    context: unknown,
    activityType: VisionActivityType = "auto",
    options?: { skipUnchanged?: boolean; onVisualSpike?: () => void },
  ): Promise<VisionCommentResult | null> {
    if (this.isProcessing) {
      throw new Error("正在观察屏幕中，请稍候…");
    }

    let base64Image = this.captureCurrentFrame();

    // If in Electron desktop app, use direct native hardware capture
    if (!base64Image && typeof window !== "undefined" && window.electronAPI?.captureScreenFrame) {
      try {
        base64Image = await window.electronAPI.captureScreenFrame();
      } catch {}
    }

    if (!base64Image) {
      throw new Error("尚未开启屏幕共享或画面尚未就绪，请先点击「开启看屏幕」。");
    }

    const frame = await this.analyzeFrame(base64Image);
    const previous = this.previousFrame;
    this.previousFrame = frame;
    const difference = previous ? this.frameDifference(previous.signature, frame.signature) : 1;
    const luminanceDrop = previous ? previous.luminance - frame.luminance : 0;
    // The first sample has no baseline and must never be treated as a jump scare.
    const visualSpike = previous !== null && (difference > 0.34 || (difference > 0.2 && luminanceDrop > 0.18));
    const now = Date.now();
    if (visualSpike && options?.onVisualSpike && now - this.lastSpikeAt > 15_000) {
      this.lastSpikeAt = now;
      options.onVisualSpike();
    }
    if (options?.skipUnchanged && difference < 0.075 && now - this.lastModelRequestAt < 120_000) {
      return null;
    }

    this.isProcessing = true;
    this.lastModelRequestAt = now;
    try {
      const response = await fetch(apiUrl("/api/vision/comment"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Image,
          activityType,
          context,
          provider: providerCfg,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `视觉分析失败（${response.status}）`);
      }

      const result: VisionCommentResult = await response.json();
      const normalized = result.commentary.replace(/\s+/g, "").slice(0, 80);
      if (options?.skipUnchanged && normalized === this.lastCommentary) return null;
      this.lastCommentary = normalized;
      return result;
    } finally {
      this.isProcessing = false;
    }
  }

  public startAutoPatrol(
    intervalSeconds: number,
    onComment: (result: VisionCommentResult) => void,
    providerCfg: unknown,
    context: unknown,
    activityType: VisionActivityType = "auto",
    onVisualSpike?: () => void,
  ) {
    this.stopAutoPatrol();
    this.previousFrame = null;
    this.lastModelRequestAt = 0;
    this.lastCommentary = "";
    const intervalMs = Math.max(10, intervalSeconds) * 1000;
    this.autoPatrolTimer = window.setInterval(async () => {
      if (!this.isSharing() || this.isProcessing) return;
      try {
        const result = await this.requestComment(providerCfg, context, activityType, {
          skipUnchanged: true,
          onVisualSpike,
        });
        if (result && result.commentary) {
          onComment(result);
        }
      } catch (e) {
        console.warn("[AutoVision] Periodic check error:", e);
      }
    }, intervalMs);
  }

  public stopAutoPatrol() {
    if (this.autoPatrolTimer) {
      window.clearInterval(this.autoPatrolTimer);
      this.autoPatrolTimer = null;
    }
    this.previousFrame = null;
  }

  private analyzeFrame(dataUrl: string): Promise<FrameAnalysis> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 24;
        canvas.height = 14;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) { reject(new Error("无法分析屏幕画面。")); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const signature: number[] = [];
        let total = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          const luminance = (pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722) / 255;
          signature.push(luminance);
          total += luminance;
        }
        resolve({ signature, luminance: total / signature.length });
      };
      image.onerror = () => reject(new Error("无法读取屏幕画面。"));
      image.src = dataUrl;
    });
  }

  private frameDifference(previous: number[], current: number[]) {
    const length = Math.min(previous.length, current.length);
    if (!length) return 1;
    let total = 0;
    for (let index = 0; index < length; index += 1) total += Math.abs(previous[index] - current[index]);
    return total / length;
  }

  public get autoPatrolActive(): boolean {
    return this.autoPatrolTimer !== null;
  }
}

export const screenVision = new ScreenVisionManager();
