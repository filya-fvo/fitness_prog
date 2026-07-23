import axios from "axios";

// Empty/same-origin works with Vite dev proxy + single ngrok tunnel.
// For split hosts set VITE_API_URL=https://api.example.com
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
  return config;
});
