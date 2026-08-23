// Web Audio API procedural white/pink noise generator
// 100% offline, zero external audio assets required

export type WhiteNoiseType = "rain" | "breeze" | "pink_noise" | "campfire" | "none";

class WhiteNoiseManager {
  private ctx: AudioContext | null = null;
  private currentSource: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private currentType: WhiteNoiseType = "none";
  private timerId: number | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  public play(type: WhiteNoiseType, volume = 0.5) {
    if (type === "none") {
      this.stop();
      return;
    }

    this.initContext();
    if (!this.ctx) return;

    if (this.currentType === type && this.gainNode) {
      this.setVolume(volume);
      return;
    }

    this.stop();
    this.currentType = type;

    const bufferSize = this.ctx.sampleRate * 2; // 2-second looping buffer
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate procedural noise base
    if (type === "rain") {
      // Soft gentle rain (filtered brown/pink noise with subtle random raindrops)
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        // Brown noise filter
        lastOut = (lastOut + 0.02 * white) / 1.02;
        // Raindrop crackle
        const raindrop = Math.random() < 0.0008 ? (Math.random() * 0.4 - 0.2) : 0;
        data[i] = (lastOut * 2.8 + raindrop);
      }
    } else if (type === "breeze") {
      // Soft ambient wind/breeze (low pass filtered soft noise)
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99 * b0 + white * 0.05;
        b1 = 0.96 * b1 + white * 0.1;
        b2 = 0.92 * b2 + white * 0.15;
        data[i] = (b0 + b1 + b2) * 0.8;
      }
    } else if (type === "campfire") {
      // Warm campfire crackle
      let last = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.04 * white) / 1.04;
        const pop = Math.random() < 0.0015 ? (Math.random() * 0.7 - 0.35) : 0;
        data[i] = last * 1.8 + pop;
      }
    } else {
      // Standard gentle pink noise
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    // Filter node for softer acoustic texture
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(type === "rain" ? 1800 : type === "breeze" ? 700 : 1200, this.ctx.currentTime);

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.setValueAtTime(Math.max(0.01, Math.min(1, volume)), this.ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);

    noiseSource.start();
    this.currentSource = noiseSource;
  }

  public setVolume(volume: number) {
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.05);
    }
  }

  public stop() {
    if (this.currentSource) {
      try {
        (this.currentSource as AudioBufferSourceNode).stop();
        this.currentSource.disconnect();
      } catch {
        // ignore already stopped error
      }
      this.currentSource = null;
    }
    if (this.timerId) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.currentType = "none";
  }

  public getCurrentType(): WhiteNoiseType {
    return this.currentType;
  }
}

export const whiteNoise = new WhiteNoiseManager();
