import { useEffect, useState } from "react";

import { fetchSupportScreenshot, type SupportAttachment } from "@/api/support";

export function SupportScreenshot({ attachment }: { attachment: SupportAttachment }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    void fetchSupportScreenshot(attachment.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.id]);

  if (failed) return <p className="mt-2 text-xs opacity-75">Не удалось загрузить скриншот</p>;
  if (!url) return <div className="mt-2 h-24 animate-pulse rounded-xl bg-black/10" aria-label="Загрузка скриншота" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-2 block" aria-label="Открыть скриншот">
      <img src={url} alt="Скриншот обращения" loading="lazy" className="max-h-72 w-full rounded-xl object-contain" />
    </a>
  );
}
