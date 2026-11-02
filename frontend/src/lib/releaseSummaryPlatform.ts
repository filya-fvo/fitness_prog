import type { ReleaseNotice } from "@/api/releaseNotices";
import { fetchLatestRelease } from "@/lib/appUpdate";

/** Native builds alias this to actual installed-APK eligibility. */
export async function eligibleReleaseSummaries(items: ReleaseNotice[]): Promise<ReleaseNotice[]> {
  const latest = await fetchLatestRelease();
  return latest?.buildId === __FITNESS_BUILD_ID__ ? items : [];
}
