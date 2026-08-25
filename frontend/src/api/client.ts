import axios from "axios";

// Empty/same-origin works with Vite dev proxy, local Tailscale and the combined
// Timeweb image. Set VITE_API_URL only when the API is intentionally split out.
const API_URL = import.meta.env.VITE_API_URL ?? "";

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const TOKEN_KEY = "fitness_jwt";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // The browser must generate the multipart boundary itself. Keeping the
  // instance's JSON Content-Type here produces an unreadable upload in some clients.
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    if (typeof config.headers.delete === "function") {
      config.headers.delete("Content-Type");
    } else {
      delete (config.headers as Record<string, unknown>)["Content-Type"];
    }
  }
  return config;
});
