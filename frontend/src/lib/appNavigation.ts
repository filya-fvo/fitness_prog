const rootPaths = new Set(["/", "/train", "/progress", "/help-center", "/profile", "/onboarding"]);

export function shouldShowPageBack(pathname: string): boolean {
  return !rootPaths.has(pathname);
}

export function fallbackPathFor(pathname: string): string {
  if (pathname.startsWith("/admin/")) return "/admin";
  if (pathname.startsWith("/progress/")) return "/progress";
  if (pathname.startsWith("/workouts/active/")) return "/train";
  if (pathname === "/workouts" || pathname === "/programs") return "/train";
  if (pathname === "/measurements") return "/progress";
  if (pathname === "/profile/settings" || pathname === "/notifications" || pathname === "/social" || pathname === "/invite") {
    return "/profile";
  }
  if (pathname === "/ai" || pathname === "/support") return "/help-center";
  if (pathname === "/admin") return "/profile";
  if (
    pathname === "/faq" ||
    pathname === "/help" ||
    pathname === "/knowledge"
  ) {
    return "/help-center";
  }
  return "/";
}
