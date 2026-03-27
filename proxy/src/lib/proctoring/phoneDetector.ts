import "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

export interface PhoneDetection {
  bbox: [number, number, number, number];
  score: number;
}

const PHONE_CLASS_NAME = "cell phone";

export const PHONE_DETECTION_INTERVAL_MS = 250;
export const PHONE_MIN_CONFIDENCE = 0.5;

export class PhoneDetector {
  private model: cocoSsd.ObjectDetection | null = null;
  private loadingPromise: Promise<cocoSsd.ObjectDetection> | null = null;

  async init(): Promise<void> {
    if (this.model) {
      return;
    }

    if (!this.loadingPromise) {
      this.loadingPromise = cocoSsd.load({ base: "lite_mobilenet_v2" });
    }

    this.model = await this.loadingPromise;
  }

  async detect(video: HTMLVideoElement): Promise<PhoneDetection[]> {
    if (!this.model) {
      return [];
    }

    // Full-frame inference: detects phones anywhere in the visible image.
    const predictions = await this.model.detect(video);

    return predictions
      .filter((prediction) => prediction.class === PHONE_CLASS_NAME)
      .filter((prediction) => prediction.score >= PHONE_MIN_CONFIDENCE)
      .map((prediction) => ({
        bbox: [prediction.bbox[0], prediction.bbox[1], prediction.bbox[2], prediction.bbox[3]],
        score: prediction.score
      }));
  }
}

export function drawPhoneDetections(canvas: HTMLCanvasElement, detections: PhoneDetection[]): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.save();
  for (const detection of detections) {
    const [x, y, width, height] = detection.bbox;

    ctx.strokeStyle = "#ff4d4f";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    const label = `Phone detected ${(detection.score * 100).toFixed(0)}%`;
    ctx.font = "12px Inter, sans-serif";
    const textWidth = ctx.measureText(label).width;

    ctx.fillStyle = "rgba(255,77,79,0.9)";
    ctx.fillRect(x, Math.max(0, y - 18), textWidth + 8, 16);

    ctx.fillStyle = "#0a0a0a";
    ctx.fillText(label, x + 4, Math.max(12, y - 6));
  }
  ctx.restore();
}
