/**
 * Barcode scanner for nutrition diary.
 * Uses BarcodeDetector when available; falls back to manual EAN entry.
 */
import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
}

export function BarcodeScannerModal({ open, onClose, onDetected }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastCodeRef = useRef<string>("");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [detectorSupported, setDetectorSupported] = useState(true);
  const [hint, setHint] = useState("Наведите камеру на штрихкод");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    lastCodeRef.current = "";
    setError(null);
    setCameraReady(false);
    setManual("");
    setHint("Наведите камеру на штрихкод");

    const Detector = getBarcodeDetector();
    setDetectorSupported(Boolean(Detector));

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Камера недоступна в этом браузере. Введите код вручную.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
          setCameraReady(true);
        }

        if (!Detector) {
          setHint("Автоскан недоступен — введите цифры с упаковки ниже");
          return;
        }

        const detector = new Detector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
        });

        const tick = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (v && v.readyState >= 2) {
            try {
              const codes = await detector.detect(v);
              const raw = codes.find((c) => c.rawValue)?.rawValue?.trim();
              const digits = raw ? raw.replace(/\D/g, "") : "";
              if (digits && digits.length >= 8 && digits !== lastCodeRef.current) {
                lastCodeRef.current = digits;
                onDetected(digits);
                return;
              }
            } catch {
              // ignore frame errors
            }
          }
          rafRef.current = window.setTimeout(() => {
            void tick();
          }, 250) as unknown as number;
        };
        void tick();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Не удалось открыть камеру";
        setError(
          /Permission|NotAllowed|denied/i.test(msg)
            ? "Нет доступа к камере. Разрешите камеру в Telegram/браузере или введите код вручную."
            : msg,
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (rafRef.current != null) {
        window.clearTimeout(rafRef.current);
        rafRef.current = null;
      }
      const stream = streamRef.current;
      streamRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      const video = videoRef.current;
      if (video) {
        video.srcObject = null;
      }
    };
  }, [open, onDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-[#1f1f23] text-white shadow-xl">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold">Сканер штрихкода</h3>
            <p className="text-[11px] text-white/60">{hint}</p>
          </div>
          <button type="button" className="text-sm text-white/70" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="aspect-[3/4] w-full object-cover"
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
          {!detectorSupported ? (
            <p className="text-[11px] text-white/50">
              В этом клиенте нет автораспознавания — используйте ручной ввод EAN.
            </p>
          ) : null}
          <label className="block text-xs text-white/70">
            Или введите код вручную
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
