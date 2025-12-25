import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Array<string | undefined | null | false>) {
  return twMerge(clsx(inputs));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("netcfg_token");
}

let cachedApiBase: string | null = null;
function getCachedApiBase(): string | null {
  if (cachedApiBase) return cachedApiBase;
  if (typeof window === "undefined") return null;
  try { const v = localStorage.getItem("netcfg_api_base"); if (v && v.trim()) { cachedApiBase = v.trim(); return cachedApiBase; } } catch {}
  return null;
}
function setCachedApiBase(v: string): void {
  cachedApiBase = v;
  if (typeof window === "undefined") return;
  try { localStorage.setItem("netcfg_api_base", v); } catch {}
}
async function pingBase(base: string, timeoutMs = 1500): Promise<boolean> {
  const url = `${base}/health`;
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const to = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch {} }, timeoutMs) : undefined;
  try {
    const res = await fetch(url, { method: "GET", signal: ctrl?.signal });
    return !!res.ok;
  } catch {
    return false;
  } finally {
    if (to) clearTimeout(to);
  }
}
async function resolveApiBase(): Promise<string> {
  const envBase = process.env.NEXT_PUBLIC_API_BASE_URL && process.env.NEXT_PUBLIC_API_BASE_URL.trim()
    ? process.env.NEXT_PUBLIC_API_BASE_URL.trim()
    : "";
  const candidates: string[] = [];
  if (envBase) candidates.push(envBase);
  candidates.push("http://127.0.0.1:3001");
  candidates.push("http://localhost:3001");
  candidates.push("http://localhost:43101");
  for (const b of candidates) {
    const ok = await pingBase(b).catch(() => false);
    if (ok) { setCachedApiBase(b); return b; }
  }
  return candidates[0] || "http://127.0.0.1:3001";
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  let base = getCachedApiBase();
  if (!base) base = await resolveApiBase();
  const headers = new Headers(init?.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let lastErr: any;
  const bases = [base, "http://127.0.0.1:3001", "http://localhost:3001", "http://localhost:43101"];
  for (const b of bases) {
    const u = path.startsWith("/") ? `${b}${path}` : `${b}/${path}`;
    try {
      const res = await fetch(u, { ...init, headers });
      setCachedApiBase(b);
      return res;
    } catch (e: any) {
      lastErr = e;
      const msg = e?.message ? String(e.message) : "";
      const isNetErr = e && (e.name === "TypeError" || /Failed to fetch|ERR_CONNECTION_RESET|ERR_EMPTY_RESPONSE|NetworkError/i.test(msg));
      if (!isNetErr) break;
      continue;
    }
  }
  throw lastErr;
}

export function logout(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("netcfg_token");
  window.location.assign("/login");
}

export async function reportClientError(payload: {
  route: string;
  method: string;
  statusCode?: number;
  code: string;
  message: string;
  stack?: string;
  deviceId?: string;
  executionId?: string;
  requestBody?: any;
  requestQuery?: any;
}): Promise<void> {
  try {
    const token = getToken();
    if (!token) return;
    await apiFetch("/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {}
}
