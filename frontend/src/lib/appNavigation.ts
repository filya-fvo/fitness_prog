const rootPaths = new Set(["/", "/train", "/nutrition", "/progress", "/more", "/onboarding"]);

export function shouldShowPageBack(pathname: string): boolean {
  return !rootPaths.has(pathname);
}

export function fallbackPathFor(pathname: string): string {
  if (pathname.startsWith("/admin/")) return "/admin";
  if (pathname.startsWith("/workouts/active/")) return "/train";
  if (pathname === "/workouts" || pathname === "/programs") return "/train";
  if (
    pathname === "/profile" ||
    pathname === "/measurements" ||
    pathname === "/ai" ||
    pathname === "/admin" ||
    pathname === "/help" ||
    pathname === "/knowledge"
  ) {
    return "/more";
  }
  return "/";
}
