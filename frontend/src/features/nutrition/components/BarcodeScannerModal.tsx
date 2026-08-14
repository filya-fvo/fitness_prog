/**
 * Barcode scanner for nutrition diary.
 *
 * 1) Native BarcodeDetector (Chrome Android) when available
 * 2) ZXing fallback (iOS Safari / Telegram WebView — no BarcodeDetector)
 * 3) Manual EAN entry always available
 */
import { useEffect, useRef, useState } from "react";

import { useModalAccessibility } from "@/hooks/useModalAccessibility";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

type ZxingControls = { stop: () => void };

type ZxingReader = {
  decodeFromStream: (
    stream: MediaStream,
    video: HTMLVideoElement | undefined,
    cb: (result: { getText(): string } | undefined, err?: unknown) => void,
  ) => Promise<ZxingControls>;
  reset: () => void;
};

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
}

function normalizeCode(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw).replace(/\D/g, "");
}

function hasLiveVideoTrack(stream: MediaStream | null): boolean {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));
}

function setVideoTracksEnabled(stream: MediaStream, enabled: boolean): void {
  for (const track of stream.getVideoTracks()) track.enabled = enabled;
}

async function openCameraStream(existing: MediaStream | null): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Камера недоступна в этом клиенте");
  }

  if (existing && hasLiveVideoTrack(existing)) {
    setVideoTracksEnabled(existing, true);
    return existing;
  }
  existing?.getTracks().forEach((track) => track.stop());

  // iOS WebKit is picky: prefer simple facingMode string, then fall back.
  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      audio: false,
      video: { facingMode: "environment" },
    },
    {
      audio: false,
      video: true,
    },
  ];

  let lastErr: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      lastErr = err;
      // A permission denial cannot be fixed by trying looser constraints and
      // may otherwise result in several consecutive prompts in a WebView.
      if (
        err instanceof DOMException &&
        ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(err.name)
      ) {
        throw err;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Не удалось открыть камеру");
}

/** ZXing BrowserMultiFormatReader — dynamic import so Android native path stays light. */
async function createZxingReader(): Promise<ZxingReader | null> {
  try {
    const mod = await import("@zxing/browser");
    const Reader = mod.BrowserMultiFormatReader;
    if (!Reader) return null;
    const reader = new Reader(undefined, {
      delayBetweenScanAttempts: 250,
      delayBetweenScanSuccess: 800,
      tryPlayVideoTimeout: 8000,
    });
    return reader as unknown as ZxingReader;
  } catch {
    return null;
  }
}

export function BarcodeScannerModal({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const zxingRef = useRef<ZxingReader | null>(null);
  const zxingControlsRef = useRef<ZxingControls | null>(null);
  const lastCodeRef = useRef<string>("");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [engine, setEngine] = useState<"native" | "zxing" | "manual">("manual");
  const [hint, setHint] = useState("Наведите камеру на штрихкод");
  const dialogRef = useModalAccessibility(open, onClose);

  useEffect(() => {
    return () => {
      const stream = streamRef.current;
      streamRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    lastCodeRef.current = "";
    setError(null);
    setCameraReady(false);
    setManual("");
    setEngine("manual");
    setHint("Держите штрихкод ровно в рамке, 10–20 см от камеры");
    const mountedVideo = videoRef.current;

    const Detector = getBarcodeDetector();

    function emitCode(raw: string) {
      const digits = normalizeCode(raw);
      if (!digits || digits.length < 8) return;
      if (digits === lastCodeRef.current) return;
      lastCodeRef.current = digits;
      onDetected(digits);
    }

    async function startNative(video: HTMLVideoElement, Ctor: BarcodeDetectorCtor) {
      setEngine("native");
      setHint("Автоскан · держите код в рамке");
      const detector = new Ctor({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
      });

      const tick = async () => {
        if (cancelled) return;
        if (video.readyState >= 2) {
          try {
            const codes = await detector.detect(video);
            const raw = codes.find((c) => c.rawValue)?.rawValue;
            if (raw) {
              emitCode(raw);
              return;
            }
          } catch {
            // ignore frame errors
          }
        }
        timerRef.current = window.setTimeout(() => {
          void tick();
        }, 250);
      };
      void tick();
    }

    async function startZxing(video: HTMLVideoElement, stream: MediaStream) {
      setHint("Автоскан (iOS) · держите код в рамке, без блика");
      const reader = await createZxingReader();
      if (!reader || cancelled) {
        setEngine("manual");
        setHint("Автоскан недоступен — введите 8–13 цифр с упаковки");
        return;
      }
      setEngine("zxing");
      zxingRef.current = reader;

      const controls = await reader.decodeFromStream(stream, video, (result) => {
        if (cancelled) return;
        if (result) {
          try {
            emitCode(result.getText());
          } catch {
            // ignore
          }
        }
      });

      if (cancelled) {
        try {
          controls.stop();
        } catch {
          // ignore
        }
        return;
      }
      zxingControlsRef.current = controls;
    }

    async function start() {
      try {
        const existing = streamRef.current;
        const stream = await openCameraStream(existing);
        if (cancelled) {
          if (stream === existing) setVideoTracksEnabled(stream, false);
          else stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = mountedVideo;
        if (!video) {
          setError("Видеоэлемент недоступен");
          return;
        }

        // Critical for iOS: attributes before play
        video.setAttribute("playsinline", "true");
        video.setAttribute("webkit-playsinline", "true");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;

        try {
          await video.play();
        } catch {
          await new Promise<void>((resolve) => {
            const onMeta = () => {
              video.removeEventListener("loadedmetadata", onMeta);
              resolve();
            };
            video.addEventListener("loadedmetadata", onMeta);
            window.setTimeout(resolve, 400);
          });
          await video.play().catch(() => {
            /* still try detect path */
          });
        }
        if (cancelled) return;
        setCameraReady(true);

        if (Detector) {
          await startNative(video, Detector);
          return;
        }
        await startZxing(video, stream);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Не удалось открыть камеру";
        setError(
          /Permission|NotAllowed|denied|NotReadable|TrackStart/i.test(msg)
            ? "Нет доступа к камере. В Telegram: настройки чата → камера, или введите код вручную."
            : msg,
        );
        setEngine("manual");
        setHint("Ручной ввод кода с упаковки");
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      try {
        zxingControlsRef.current?.stop();
      } catch {
        // ignore
      }
      zxingControlsRef.current = null;
      try {
        zxingRef.current?.reset();
      } catch {
        // ignore
      }
      zxingRef.current = null;
      const stream = streamRef.current;
      if (stream) setVideoTracksEnabled(stream, false);
      if (mountedVideo) {
        mountedVideo.pause();
        mountedVideo.srcObject = null;
      }
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
        tabIndex={-1}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-[#1f1f23] text-white shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div>
            <h3 id="barcode-scanner-title" className="text-base font-semibold">Сканер штрихкода</h3>
            <p className="text-[11px] text-white/60">{hint}</p>
          </div>
          <button type="button" aria-label="Закрыть сканер" className="text-sm text-white/70" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="aspect-[3/4] w-full bg-black object-cover"
            playsInline
            muted
            autoPlay
          />
          {!cameraReady && !error ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
              Открываем камеру…
            </div>
          ) : null}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-28 w-[78%] rounded-xl border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
          </div>
        </div>

        <div className="space-y-2 p-4">
          {error ? <p className="text-xs text-red-300">{error}</p> : null}
          <p className="text-[11px] text-white/55">
            {engine === "zxing"
              ? "iPhone: автоскан через ZXing. Держите ровно, без блика; при необходимости введите код."
              : engine === "native"
                ? "Не пикает? Держите ровно, уберите блик, или введите код с упаковки (EAN-13 / UPC)."
                : "Автоскан недоступен — введите 8–13 цифр с упаковки (EAN-13 / UPC)."}
          </p>
          <label className="block text-xs text-white/70">
            Код вручную (если камера не считывает)
            <div className="mt-1 flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value.replace(/[^\d]/g, "").slice(0, 14))}
                inputMode="numeric"
                placeholder="4601234567890"
                className="w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white"
              />
              <button
                type="button"
                disabled={manual.replace(/\D/g, "").length < 8}
                onClick={() => onDetected(manual.replace(/\D/g, ""))}
                className="shrink-0 rounded-lg bg-tg-button px-3 py-2 text-sm font-semibold text-tg-button-text disabled:opacity-50"
              >
                Найти
              </button>
            </div>
          </label>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-white/10 px-3 py-2 text-sm"
          >
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}
