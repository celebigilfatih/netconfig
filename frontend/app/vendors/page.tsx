"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { AppShell } from "../../components/layout/app-shell";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../components/ui/select";
import { useAlerts } from "../../lib/alerts";
import { apiFetch, logout, cn, getToken } from "../../lib/utils";
import { Badge } from "../../components/ui/badge";
import { vendorToneClasses, vendorIcon } from "../../lib/vendor";

type Vendor = { id: string; slug: string; name: string; is_active: boolean };

export default function VendorsPage() {
  return (
    <AppShell>
      <VendorsContent />
    </AppShell>
  );
}

function VendorsContent() {
  const [items, setItems] = useState<Vendor[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [reassignId, setReassignId] = useState<string | null>(null);
  const [targetSlug, setTargetSlug] = useState("");
  const [targetName, setTargetName] = useState("");
  const { push } = useAlerts();

  async function load() {
    setError("");
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const qs = params.toString();
      const res = await apiFetch(qs ? `/vendors?${qs}` : "/vendors");
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Veri alınamadı");
        return;
      }
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError("Ağ hatası");
    }
  }

  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;
    const token = getToken();
    if (!token) { logout(); return; }
    const res = await apiFetch(`/vendors/${id}`, { method: "DELETE" });
    if (res.status === 204) {
      setItems((prev) => prev.filter((v) => v.id !== id));
      return;
    }
    const j = await res.json().catch(() => ({} as any));
    if (res.status === 409) {
      setReassignId(id);
      return;
    }
    alert(j?.message || "Silinemedi");
  }

  function normSlug(s: string) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  async function reassignAndDelete() {
    if (!reassignId) return;
    const token = getToken();
    if (!token) { logout(); return; }
    const ts = normSlug(targetSlug || targetName);
    if (!ts) return;
    const res = await apiFetch(`/vendors/${reassignId}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetSlug: ts, targetName }),
    });
    if (res.ok) {
      setReassignId(null);
      setTargetSlug("");
      setTargetName("");
      load();
      const j = await res.json().catch(() => ({} as any));
      push({ variant: "success", message: `Taşındı: ${j?.moved ?? 0} cihaz, hedef: ${j?.targetSlug ?? ts}` });
    } else {
      const j = await res.json().catch(() => ({} as any));
      alert(j?.message || "Taşıma başarısız");
    }
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Vendorlar</h2>
          <div className="flex gap-2">
            <Button asChild><Link href="/vendors/new">Yeni Vendor</Link></Button>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Card>
          <CardHeader>
            <CardTitle>Liste</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 mb-3">
              <div className="flex-1"><Input placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <Button onClick={load}>Ara</Button>
            </div>
            <ul className="space-y-2">
              {items.map((v) => (
                <li key={v.id} className="flex items-center gap-2 rounded-md border p-3">
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      <span>{v.name}</span>
                      <Badge className={cn("gap-1", vendorToneClasses(v.slug))}>
                        {vendorIcon(v.slug)}
                        <span>{v.slug}</span>
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">Durum: {v.is_active ? "Aktif" : "Pasif"}</div>
                  </div>
                  <Button size="sm" variant="outline" asChild><Link href={`/vendors/${v.id}`}>Düzenle</Link></Button>
                  <Button size="sm" variant="outline" onClick={() => remove(v.id)}>Sil</Button>
                  <Button size="sm" variant="outline" onClick={() => setReassignId(v.id)}>Zorla Sil</Button>
                </li>
              ))}
              {items.length === 0 && <li className="text-sm text-muted-foreground">Kayıt yok</li>}
            </ul>
          </CardContent>
        </Card>
      </div>

      {reassignId && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setReassignId(null)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-card text-card-foreground rounded-md border shadow-lg">
            <div className="p-4">
              <div className="text-lg font-semibold mb-3">Vendor’u Taşı ve Sil</div>
              <div className="grid gap-3">
                <div>
                  <label className="text-sm">Mevcut Vendor Seç</label>
                  <Select value={targetSlug} onValueChange={(val) => { setTargetSlug(val); const sel = items.find(i => i.slug === val); setTargetName(sel?.name || ""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Hedef vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {items.filter(i => i.id !== reassignId && i.is_active).map((i) => (
                        <SelectItem key={i.id} value={i.slug}>{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm">Hedef Slug</label>
                  <Input value={targetSlug} onChange={(e) => setTargetSlug(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm">Hedef Ad</label>
                  <Input value={targetName} onChange={(e) => setTargetName(e.target.value)} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={reassignAndDelete} disabled={!normSlug(targetSlug || targetName)}>Taşı ve Sil</Button>
                  <Button variant="outline" onClick={() => setReassignId(null)}>Kapat</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
