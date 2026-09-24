export type AppCardTone =
  | "neutral"
  | "indigo"
  | "plum"
  | "ember"
  | "ocean"
  | "interactive"
  | "hero"
  | "inset"
  | "success"
  | "warning"
  | "danger";

export type AppButtonTone = "primary" | "secondary" | "ghost" | "danger";
export type AppChipTone = "neutral" | "info" | "success" | "warning" | "danger";
export type StatusNoticeTone = "info" | "success" | "warning" | "danger";

export function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function cardClass(tone: AppCardTone = "neutral"): string {
  return `app-card app-card-${tone}`;
}

export function buttonClass(tone: AppButtonTone = "primary"): string {
  const toneClass: Record<AppButtonTone, string> = {
    primary: "app-primary-action app-gradient-action",
    secondary: "app-secondary-action",
    ghost: "app-ghost-action",
    danger: "app-danger-action",
  };
  return `app-button ${toneClass[tone]}`;
}

export function fieldClass(): string {
  return "app-field";
}

export function chipClass(tone: AppChipTone = "neutral"): string {
  return `app-chip app-chip-${tone}`;
}

export function statusClass(tone: StatusNoticeTone = "info"): string {
  return `app-status app-status-${tone}`;
}
