/// <reference lib="webworker" />

import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkOnly } from "workbox-strategies";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const apiPrefixes = [
  "/auth", "/exercises", "/programs", "/workouts", "/users", "/health",
  "/nutrition", "/ai", "/notifications", "/supplements", "/feedback", "/telegram", "/admin",
];
registerRoute(({ url }) => apiPrefixes.some((prefix) => url.pathname.startsWith(prefix)), new NetworkOnly());
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

self.addEventListener("push", (event: PushEvent) => {
  let data: Record<string, string> = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() ?? "Новое напоминание" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Fitness", {
      body: data.body || "Откройте приложение",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      tag: data.tag || "fitness-reminder",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  const target = new URL(String(event.notification.data?.url || "/"), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          await client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
