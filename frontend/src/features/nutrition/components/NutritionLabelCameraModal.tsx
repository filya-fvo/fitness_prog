import { useEffect, useRef, useState } from "react";

import { useModalAccessibility } from "@/hooks/useModalAccessibility";

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onPhoto: (file: File) => void;
};

async function cameraStream(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error("Камера доступна только по защищённому HTTPS-соединению");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Камера недоступна в этом клиенте");
  }
  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    },
    { audio: false, video: { facingMode: "environment" } },
    { audio: false, video: true },
  ];
  let lastError: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
      if (
        error instanceof DOMException &&
        ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error.name)
      ) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Не удалось открыть камеру");
}

function frameToFile(video: HTMLVideoElement): Promise<File> {
  if (video.videoWidth < 2 || video.videoHeight < 2) {
    return Promise.reject(new Error("Камера ещё не готова"));
  }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Не удалось сделать снимок"));
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Не удалось сделать снимок"));
          return;
        }
        resolve(new File([blob], `nutrition-label-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  });
}

export function NutritionLabelCameraModal({ open, busy, onClose, onPhoto }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalAccessibility(open, onClose);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const mountedVideo = videoRef.current;
    setReady(false);
    setError(null);

    void cameraStream()
      .then(async (value) => {
        if (cancelled) {
          value.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = value;
        const video = mountedVideo;
        if (!video) throw new Error("Видеоэлемент недоступен");
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = value;
        await video.play();
        if (!cancelled) setReady(true);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : "Не удалось открыть камеру";
        setError(
          /Permission|NotAllowed|denied|Security/i.test(message)
            ? "Нет доступа к камере. Разрешите камеру в настройках браузера или выберите фото."
            : message,
        );
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
      if (mountedVideo) {
        mountedVideo.pause();
        mountedVideo.srcObject = null;
      }
    };
  }, [open]);

  if (!open) return null;

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || busy) return;
    try {
      setError(null);
      onPhoto(await frameToFile(video));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось сделать снимок");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nutrition-label-camera-title"
        tabIndex={-1}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-[#1f1f23] text-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div>
            <h3 id="nutrition-label-camera-title" className="text-base font-semibold">
              Фото этикетки
            </h3>
            <p className="text-[11px] text-white/60">Таблица целиком, крупно и без бликов</p>
          </div>
          <button
            type="button"
            aria-label="Закрыть камеру"
            onClick={onClose}
            className="tap-target flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-white/70"
          >
            ✕
          </button>
        </div>

        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="aspect-[4/3] max-h-[48dvh] w-full bg-black object-cover"
            playsInline
            muted
            autoPlay
          />
          {!ready && !error ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
              Открываем камеру…
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
            <div className="h-[72%] w-full rounded-xl border-2 border-emerald-400/80" />
          </div>
        </div>

        <div className="space-y-2 p-4">
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
          <button
            type="button"
            disabled={!ready || busy}
            onClick={() => void takePhoto()}
            className="w-full rounded-xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text disabled:opacity-50"
          >
            {busy ? "Распознаём…" : "Сфотографировать"}
          </button>
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onPhoto(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
            className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm disabled:opacity-50"
          >
            Выбрать фото или файл
          </button>
          <button type="button" disabled={busy} onClick={onClose} className="w-full py-2 text-sm text-white/60">
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
