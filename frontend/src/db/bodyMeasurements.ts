import type { BodyMeasurement } from "@/api/bodyMeasurements";
import { db, type LocalBodyMeasurement, type SyncQueueItem } from "@/db/schema";

const MEASUREMENT_QUEUE_TYPES = new Set<SyncQueueItem["type"]>([
  "upsert_measurement",
  "delete_measurement",
]);

export function bodyMeasurementKey(ownerUserId: string, date: string): string {
  return `${ownerUserId}:${date}`;
}

export function measurementDateFromQueueItem(item: SyncQueueItem): string | null {
  if (!MEASUREMENT_QUEUE_TYPES.has(item.type)) return null;
  const date = item.payload.date;
  return typeof date === "string" ? date : null;
}

export async function readCachedBodyMeasurements(
  ownerUserId: string,
): Promise<BodyMeasurement[]> {
  const rows = await db.bodyMeasurements.where("ownerUserId").equals(ownerUserId).toArray();
  return rows
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row) => row.measurement);
}

export async function putCachedBodyMeasurement(
  ownerUserId: string,
  measurement: BodyMeasurement,
): Promise<void> {
  await db.bodyMeasurements.put({
    key: bodyMeasurementKey(ownerUserId, measurement.date),
    ownerUserId,
    date: measurement.date,
    measurement,
    updatedAt: Date.now(),
  });
}

export async function removeCachedBodyMeasurement(
  ownerUserId: string,
  date: string,
): Promise<void> {
  await db.bodyMeasurements.delete(bodyMeasurementKey(ownerUserId, date));
}

/** Replace server-backed dates while preserving newer, still queued local changes. */
export async function cacheServerBodyMeasurements(
  ownerUserId: string,
  measurements: BodyMeasurement[],
): Promise<void> {
  await db.transaction("rw", db.bodyMeasurements, db.syncQueue, async () => {
    const queued = await db.syncQueue.where("ownerUserId").equals(ownerUserId).toArray();
    const pendingDates = new Set(
      queued.map(measurementDateFromQueueItem).filter((date): date is string => Boolean(date)),
    );
    const serverDates = new Set(measurements.map((item) => item.date));
    const cached = await db.bodyMeasurements.where("ownerUserId").equals(ownerUserId).toArray();
    const staleKeys = cached
      .filter((item) => !pendingDates.has(item.date) && !serverDates.has(item.date))
      .map((item) => item.key);
    if (staleKeys.length) await db.bodyMeasurements.bulkDelete(staleKeys);
    const rows: LocalBodyMeasurement[] = measurements
      .filter((item) => !pendingDates.has(item.date))
      .map((measurement) => ({
        key: bodyMeasurementKey(ownerUserId, measurement.date),
        ownerUserId,
        date: measurement.date,
        measurement,
        updatedAt: Date.now(),
      }));
    if (rows.length) await db.bodyMeasurements.bulkPut(rows);
  });
}

export async function getPendingBodyMeasurementDates(ownerUserId: string): Promise<Set<string>> {
  const queued = await db.syncQueue.where("ownerUserId").equals(ownerUserId).toArray();
  return new Set(
    queued.map(measurementDateFromQueueItem).filter((date): date is string => Boolean(date)),
  );
}

export async function clearCachedBodyMeasurements(ownerUserId: string): Promise<void> {
  await db.bodyMeasurements.where("ownerUserId").equals(ownerUserId).delete();
}

export async function clearLocalBodyMeasurementData(ownerUserId: string): Promise<void> {
  await db.transaction("rw", db.bodyMeasurements, db.syncQueue, async () => {
    await db.bodyMeasurements.where("ownerUserId").equals(ownerUserId).delete();
    const queued = await db.syncQueue
      .where("ownerUserId")
      .equals(ownerUserId)
      .and((item) => measurementDateFromQueueItem(item) !== null)
      .primaryKeys();
    if (queued.length) await db.syncQueue.bulkDelete(queued);
  });
}
