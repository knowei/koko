/**
 * Centralized API URL resolver for Web & Desktop (Electron) clients
 */

export function getApiBaseUrl(): string {
  // 1. User-configured custom server address in Settings
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("koko-server-url");
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, "");
    }
  }

  // 2. Build-time environment variable (e.g. VITE_SERVER_URL=https://api.yourdomain.com)
  const envUrl = (import.meta as any).env?.VITE_SERVER_URL;
  if (envUrl && typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, "");
  }

  // 3. Android/iOS Capacitor package: use the address configured in Settings.
  // Without one, requests remain local and Settings can still be opened to configure it.
  if (typeof window !== "undefined" && window.location.protocol === "capacitor:") {
    return "";
  }

  // 4. Desktop Electron fallback when running locally from file://
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    return "http://localhost:8787";
  }

  // 5. Default: Same-origin relative path
  return "";
}

export function setApiBaseUrl(url: string): void {
  if (typeof window !== "undefined") {
    const clean = url.trim().replace(/\/+$/, "");
    if (clean) {
      localStorage.setItem("koko-server-url", clean);
    } else {
      localStorage.removeItem("koko-server-url");
    }
  }
}

export function apiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}
