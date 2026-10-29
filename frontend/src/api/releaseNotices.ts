import { z } from "zod";
import { apiClient } from "@/api/client";

export const releaseNoticeSchema = z.object({
  id: z.string().uuid(), release_key: z.string().min(1).max(80),
  title: z.string().min(1).max(80), message_text: z.string().min(1).max(2000),
  apk_url: z.literal("https://app.filfitclub.ru/android/latest.apk"),
  created_at: z.string().datetime({ offset: true }),
});
export type ReleaseNotice = z.infer<typeof releaseNoticeSchema>;
const response = z.object({ items: z.array(releaseNoticeSchema).max(20) });
function requestGuard(isCurrent: () => boolean) {
  return (data: unknown) => {
    if (!isCurrent()) throw new Error("Session changed");
    return data;
  };
}
export async function fetchReleaseNotices(owner: string, isCurrent: () => boolean) {
  const { data } = await apiClient.get("/notifications/release-notices", {
    params: { expected_owner: owner }, timeout: 8000, headers: { "Cache-Control": "no-cache" }, transformRequest: [requestGuard(isCurrent)],
  });
  return response.parse(data).items;
}
export async function markReleaseNoticeSeen(owner: string, id: string, isCurrent: () => boolean) {
  const { data } = await apiClient.post(`/notifications/release-notices/${z.string().uuid().parse(id)}/seen`, undefined, {
    params: { expected_owner: owner }, timeout: 8000, transformRequest: [requestGuard(isCurrent)],
  });
  z.object({ ok: z.literal(true) }).parse(data);
}
