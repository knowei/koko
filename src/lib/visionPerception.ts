/**
 * Screen & Game Vision Perception Manager
 */

export interface VisionCommentResult {
  commentary: string;
  expression: "smile" | "blush" | "shy" | "pout" | "sleepy" | "surprised";
  sceneType: "game" | "coding" | "browsing" | "video" | "idle" | "other";
}

export class ScreenVisionManager {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private autoPatrolTimer: number | null = null;
  private isProcessing = false;

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
    providerCfg: any,
    context: any,
    activityType: "game" | "coding" | "browsing" | "auto" = "auto",
  ): Promise<VisionCommentResult> {
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

    this.isProcessing = true;
    try {
      const response = await fetch("/api/vision/comment", {
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
      return result;
    } finally {
      this.isProcessing = false;
    }
  }

  public startAutoPatrol(
    intervalSeconds: number,
    onComment: (result: VisionCommentResult) => void,
    providerCfg: any,
    context: any,
  ) {
    this.stopAutoPatrol();
    const intervalMs = Math.max(10, intervalSeconds) * 1000;
    this.autoPatrolTimer = window.setInterval(async () => {
      if (!this.isSharing() || this.isProcessing) return;
      try {
        const result = await this.requestComment(providerCfg, context, "auto");
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
  }

  public get autoPatrolActive(): boolean {
    return this.autoPatrolTimer !== null;
  }
}

export const screenVision = new ScreenVisionManager();
