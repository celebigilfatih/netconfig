"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../components/ui/select";
import { apiFetch, logout, cn, getToken } from "../../lib/utils";
import { AppShell } from "../../components/layout/app-shell";
import { Badge } from "../../components/ui/badge";
import { vendorToneClasses, vendorIcon } from "../../lib/vendor";

type Device = {
  id: string;
  name: string;
  hostname: string | null;
  mgmt_ip: string | null;
  ssh_port: number;
  vendor: string;
  is_active: boolean;
};

type Vendor = { id: string; slug: string; name: string; is_active: boolean };

export default function DevicesPage() {
  return (
    <AppShell>
      <Suspense fallback={<div />}> 
        <DevicesContent />
      </Suspense>
    </AppShell>
  );
}

function DevicesContent() {
  const [items, setItems] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [vendor, setVendor] = useState<string>("all");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const searchParams = useSearchParams();

  async function load() {
    setError("");
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const params = new URLSearchParams();
      if (vendor && vendor !== "all") params.set("vendor", vendor);
      if (q) params.set("q", q);
      if (isActive !== null) params.set("isActive", String(isActive));
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      const res = await apiFetch(`/devices?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Cihazlar yüklenemedi");
        return;
      }
      const data = await res.json();
      setItems(data.items);
    } catch {
      setError("Ağ hatası");
    }
  }

  useEffect(() => { load(); loadVendors(); }, []);

  useEffect(() => {
    const v = searchParams.get("vendor");
    const q0 = searchParams.get("q");
    const ia = searchParams.get("isActive");
    const lim = searchParams.get("limit");
    const off = searchParams.get("offset");
    if (v) setVendor(v);
    if (q0) setQ(q0);
    if (ia === "true") setIsActive(true);
    if (ia === "false") setIsActive(false);
    if (lim && !Number.isNaN(Number(lim))) setLimit(Number(lim));
    if (off && !Number.isNaN(Number(off))) setOffset(Number(off));
    setTimeout(() => { load(); }, 0);
  }, []);

  async function loadVendors() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/vendors?isActive=true&limit=100`);
      if (!res.ok) return;
      const j = await res.json();
      setVendors(j.items || []);
    } catch {}
  }

  async function triggerBackup(id: string) {
    try {
      const res = await apiFetch(`/backups/manual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: id }),
      });
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        alert("Başlatılamadı");
        return;
      }
      const data = await res.json();
      alert(`Başlatıldı: ${data.executionId}`);
    } catch {
      alert("Ağ hatası");
    }
  }

  async function deleteDevice(id: string) {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;
    try {
      const res = await apiFetch(`/devices/${id}`, { method: "DELETE" });
      if (res.status !== 204) {
        if (res.status === 401) { logout(); return; }
        alert("Silinemedi");
        return;
      }
      load();
    } catch {
      alert("Ağ hatası");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Cihazlar</h2>
        <Button asChild>
          <Link href="/devices/new">Yeni Cihaz</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Filtreler</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <Input placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="w-full md:w-64">
              <Select value={vendor} onValueChange={(val) => setVendor(val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Vendor (tümü)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Vendor (tümü)</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.slug}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isActive === true} onChange={(e) => setIsActive(e.target.checked ? true : null)} className="h-4 w-4" />
              <span>Sadece aktif</span>
            </label>
            <Button onClick={() => { setOffset(0); load(); }}>Ara</Button>
            <Button variant="outline" asChild>
              <Link href="/vendors">Vendorları Yönet</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-2 mb-3">
        <Button variant="outline" disabled={offset === 0} onClick={() => { const next = Math.max(0, offset - limit); setOffset(next); load(); }}>Önceki</Button>
        <Button variant="outline" onClick={() => { const next = offset + limit; setOffset(next); load(); }}>Sonraki</Button>
      </div>
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      <ul className="space-y-2">
        {items.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
            <span className="font-medium">{d.name}</span>
            <Badge className={cn("cursor-pointer gap-1", vendorToneClasses(d.vendor))} onClick={() => { setVendor(d.vendor); setOffset(0); load(); }}>
              {vendorIcon(d.vendor)}
              <span>{d.vendor}</span>
            </Badge>
            <div className="ml-auto flex gap-2">
              <Button size="sm" onClick={() => triggerBackup(d.id)}>Manuel Yedek</Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/backups/${d.id}`}>Geçmiş</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/devices/${d.id}/edit`}>Düzenle</Link>
              </Button>
              <Button size="sm" variant="destructive" onClick={() => deleteDevice(d.id)}>Sil</Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
  
