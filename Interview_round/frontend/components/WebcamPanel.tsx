"use client";

import { useEffect, useRef } from "react";

import { EmotionData } from "@/types/interview";

type Props = {
  emotion: EmotionData;
  subtitleText: string;
  onFrame: (base64: string) => void;
  onStreamReady: (stream: MediaStream) => void;
};

export default function WebcamPanel({ emotion, subtitleText, onFrame, onStreamReady }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    async function boot() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      onStreamReady(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Browsers may abort play() when media elements are re-bound during re-renders.
        }
      }

      interval = setInterval(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || video.videoWidth === 0) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        onFrame(canvas.toDataURL("image/jpeg", 0.7));
      }, 3000);
    }

    boot();
    return () => {
      if (interval) clearInterval(interval);
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onFrame, onStreamReady]);

  return (
    <div className="panel relative overflow-hidden p-2">
      <video ref={videoRef} className="h-[360px] w-full rounded-xl bg-black object-cover" muted />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute left-4 top-4 rounded-full bg-graphite/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white">
        {emotion.emotion} ({emotion.confidence.toFixed(1)}%)
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 w-[92%] -translate-x-1/2 overflow-hidden whitespace-nowrap text-ellipsis rounded-lg bg-black/65 px-3 py-2 text-center text-sm text-white shadow-lg">
        {subtitleText || "Live subtitles will appear here while you speak..."}
      </div>
    </div>
  );
}
