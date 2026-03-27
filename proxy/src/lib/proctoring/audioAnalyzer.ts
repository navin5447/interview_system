import { AudioMetrics } from "./types";

interface AudioAnalyzerOptions {
  onMetrics: (metrics: AudioMetrics) => void;
}

// Lightweight real-time microphone analyzer built on Web Audio API.
export class AudioAnalyzer {
  private readonly onMetrics: (metrics: AudioMetrics) => void;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  private frameHandle: number | null = null;
  private isRunning = false;

  private baseline = 0;
  private continuousStart: number | null = null;
  private previousLevel = 0;

  constructor(options: AudioAnalyzerOptions) {
    this.onMetrics = options.onMetrics;
  }

  async start(stream: MediaStream): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.audioContext = new AudioContext();
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();

    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.85;
    this.dataArray = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));

    this.source.connect(this.analyser);

    this.isRunning = true;
    this.loop();
  }

  stop(): void {
    this.isRunning = false;

    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }

    this.source?.disconnect();
    this.analyser?.disconnect();

    this.source = null;
    this.analyser = null;
    this.dataArray = null;
    this.continuousStart = null;

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }

  private loop = (): void => {
    if (!this.isRunning || !this.analyser || !this.dataArray) {
      return;
    }

    this.analyser.getByteTimeDomainData(this.dataArray as any);

    // Convert unsigned PCM waveform (0..255) into normalized [-1..1], then RMS.
    let sumSquares = 0;
    for (let i = 0; i < this.dataArray.length; i += 1) {
      const centered = (this.dataArray[i] - 128) / 128;
      sumSquares += centered * centered;
    }

    const rms = Math.sqrt(sumSquares / this.dataArray.length);
    const now = Date.now();

    // Running baseline adapts to ambient room noise.
    this.baseline = this.baseline === 0 ? rms : this.baseline * 0.98 + rms * 0.02;

    const speechThreshold = Math.max(0.02, this.baseline * 2.1);
    const continuousThreshold = Math.max(0.015, this.baseline * 1.7);
    const loudThreshold = Math.max(0.1, this.baseline * 4.5);

    const speechActive = rms > speechThreshold;

    if (rms > continuousThreshold) {
      if (this.continuousStart === null) {
        this.continuousStart = now;
      }
    } else {
      this.continuousStart = null;
    }

    const continuousSound = this.continuousStart !== null && now - this.continuousStart >= 5000;
    const suddenLoudNoise = rms > loudThreshold && rms - this.previousLevel > 0.04;

    this.previousLevel = rms;

    this.onMetrics({
      level: Math.min(1, rms * 10),
      speechActive,
      continuousSound,
      suddenLoudNoise
    });

    this.frameHandle = requestAnimationFrame(this.loop);
  };
}
