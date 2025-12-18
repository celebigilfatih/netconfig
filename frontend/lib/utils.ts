import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: Array<string | undefined | null | false>) {
  return twMerge(clsx(inputs));
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("netcfg_token");
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  const url = path.startsWith("/") ? `${base}${path}` : `${base}/${path}`;
  const headers = new Headers(init?.headers || {});
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export function logout(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("netcfg_token");
  window.location.assign("/login");
}
