import { useEffect, useState } from "react";

import {
  fetchBodyMeasurementAnalytics,
  type BodyMeasurementAnalytics,
  type BodyMeasurementPeriod,
} from "@/api/bodyMeasurements";
import { getStoredToken } from "@/api/client";
import { toUserMessage } from "@/utils/errors";
import { isOnline } from "@/utils/network";

function todayISO(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function useBodyMeasurementAnalytics(months: BodyMeasurementPeriod) {
  const [data, setData] = useState<BodyMeasurementAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    if (!getStoredToken() || !isOnline()) {
      setData(null);
      setLoading(false);
      setError("Аналитика замеров доступна онлайн после входа");
      return () => controller.abort();
    }
    setLoading(true);
    setError(null);
    void fetchBodyMeasurementAnalytics({ months, end: todayISO(), signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setData(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(toUserMessage(reason, "Не удалось загрузить аналитику замеров"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [months]);

  return { data, loading, error };
}
