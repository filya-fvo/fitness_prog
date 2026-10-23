import { openTelegramLink } from "./telegram";

/** Platform boundary: native build opens the same links outside its WebView. */
export function openExternalAppLink(url: string): void {
  if (url.startsWith("https://t.me/")) openTelegramLink(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
