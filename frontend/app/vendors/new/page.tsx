"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { AppShell } from "../../../components/layout/app-shell";
import { apiFetch, logout, getToken } from "../../../lib/utils";
import { useRouter } from "next/navigation";

export default function NewVendorPage() {
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");
  const [existing, setExisting] = useState<string[]>([]);
  const router = useRouter();

  function normSlug(s: string) {
    return (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function uniqueSlug(base: string, list: string[]) {
    const b = normSlug(base);
    if (!b) return b;
    if (!list.includes(b)) return b;
    for (let i = 2; i < 1000; i++) {
      const cand = `${b}_${i}`;
      if (!list.includes(cand)) return cand;
    }
    return `${b}_${Date.now()}`;
  }

  async function loadExisting() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/vendors?limit=100`);
      if (!res.ok) return;
      const j = await res.json();
      setExisting((j.items || []).map((v: any) => v.slug));
    } catch {}
  }

  useEffect(() => { loadExisting(); }, []);

  async function submit() {
    setError("");
    const token = getToken();
    if (!token) { logout(); return; }
    const norm = name && !slug ? name : slug;
    let s = normSlug(norm);
    if (!s) { setError("Slug gerekli"); return; }
    const res = await apiFetch(`/vendors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: s, name, isActive }) });
    if (res.status === 201) {
      router.push("/vendors");
      return;
    }
    if (res.status === 401) { logout(); return; }
    if (res.status === 409) {
      await loadExisting();
      const sug = uniqueSlug(s, existing);
      setSlug(sug);
      const res2 = await apiFetch(`/vendors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: sug, name, isActive }) });
      if (res2.status === 201) { router.push("/vendors"); return; }
    }
    const j = await res.json().catch(() => ({} as any));
    setError(j?.message || "Kaydedilemedi");
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold">Yeni Vendor</h2>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Card>
          <CardHeader>
            <CardTitle>Bilgiler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <div>
                <label className="text-sm">Slug</label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
              </div>
              <div>
                <label className="text-sm">Ad</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span>Aktif</span>
              </label>
              <div className="flex gap-2">
                <Button onClick={submit}>Kaydet</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
