export type RootRoute = "/" | "/train" | "/progress" | "/help-center" | "/profile";

export const NAV_ITEMS = [
  { to: "/", label: "Главная", icon: "home" },
  { to: "/train", label: "Упражнения", icon: "exercise" },
  { to: "/progress", label: "Дневник", icon: "diary" },
  { to: "/help-center", label: "Помощь", icon: "help" },
  { to: "/profile", label: "Профиль", icon: "profile" },
] as const;

export type NavigationIconName = (typeof NAV_ITEMS)[number]["icon"];

const ROOT_PATHS: ReadonlyArray<readonly [RootRoute, readonly string[]]> = [
  ["/", ["/", "/nutrition", "/activity", "/onboarding"]],
  ["/train", ["/train", "/workouts", "/programs"]],
  ["/progress", ["/progress", "/measurements"]],
  ["/help-center", ["/help-center", "/ai", "/support"]],
  ["/profile", ["/profile", "/notifications", "/social", "/invite", "/admin", "/more"]],
];

function ownsPath(rootPath: string, pathname: string): boolean {
  return rootPath === "/" ? pathname === "/" : pathname === rootPath || pathname.startsWith(`${rootPath}/`);
}

export function rootSectionForPath(pathname: string): RootRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  for (const [root, paths] of ROOT_PATHS) {
    if (paths.some((path) => ownsPath(path, normalized))) return root;
  }
  return "/";
}
