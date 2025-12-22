"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  const [tableFilter, setTableFilter] = useState("");
  const [vendor, setVendor] = useState<string>("all");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [isActive, setIsActive] = useState<boolean | null>(null);
  const [ipFilter, setIpFilter] = useState("");
  const [portMin, setPortMin] = useState<string>("");
  const [portMax, setPortMax] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [sortDir, setSortDir] = useState<string>("asc");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const searchParams = useSearchParams();
  const router = useRouter();

  function applyQueryToUrl(offsetOverride?: number) {
    const params = new URLSearchParams();
    if (vendor && vendor !== "all") params.set("vendor", vendor);
    if (q) params.set("q", q);
    if (isActive !== null) params.set("isActive", String(isActive));
    if (ipFilter && ipFilter.trim()) params.set("ip", ipFilter.trim());
    if (portMin !== "" && !Number.isNaN(Number(portMin))) params.set("portMin", String(Number(portMin)));
    if (portMax !== "" && !Number.isNaN(Number(portMax))) params.set("portMax", String(Number(portMax)));
    if (sortBy) params.set("sortBy", sortBy);
    if (sortDir) params.set("sortDir", sortDir);
    params.set("limit", String(limit));
    params.set("offset", String(offsetOverride ?? offset));
    router.replace(`/devices?${params.toString()}`, { scroll: false });
  }

  async function load() {
    setError("");
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const params = new URLSearchParams();
      if (vendor && vendor !== "all") params.set("vendor", vendor);
      if (q) params.set("q", q);
      if (isActive !== null) params.set("isActive", String(isActive));
      if (ipFilter && ipFilter.trim()) params.set("ip", ipFilter.trim());
      if (portMin !== "" && !Number.isNaN(Number(portMin))) params.set("portMin", String(Number(portMin)));
      if (portMax !== "" && !Number.isNaN(Number(portMax))) params.set("portMax", String(Number(portMax)));
      if (sortBy) params.set("sortBy", sortBy);
      if (sortDir) params.set("sortDir", sortDir);
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
    const ip = searchParams.get("ip");
    const pmin = searchParams.get("portMin");
    const pmax = searchParams.get("portMax");
    const sb = searchParams.get("sortBy");
    const sd = searchParams.get("sortDir");
    const lim = searchParams.get("limit");
    const off = searchParams.get("offset");
    if (v) setVendor(v);
    if (q0) setQ(q0);
    if (ia === "true") setIsActive(true);
    if (ia === "false") setIsActive(false);
    if (ip) setIpFilter(ip);
    if (pmin && !Number.isNaN(Number(pmin))) setPortMin(String(Number(pmin)));
    if (pmax && !Number.isNaN(Number(pmax))) setPortMax(String(Number(pmax)));
    if (sb) setSortBy(sb);
    if (sd) setSortDir(sd);
    if (lim && !Number.isNaN(Number(lim))) setLimit(Number(lim));
    if (off && !Number.isNaN(Number(off))) setOffset(Number(off));
    setTimeout(() => { load(); }, 0);
  }, []);

  useEffect(() => {
    applyQueryToUrl(0);
    setOffset(0);
    load();
  }, [vendor, isActive, sortBy, sortDir]);

  useEffect(() => {
    const t = setTimeout(() => {
      applyQueryToUrl(0);
      setOffset(0);
      load();
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => {
      applyQueryToUrl(0);
      setOffset(0);
      load();
    }, 300);
    return () => clearTimeout(t);
  }, [ipFilter, portMin, portMax]);

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

  const itemsFiltered = items.filter((d) => {
    if (!tableFilter.trim()) return true;
    const t = tableFilter.toLowerCase();
    return (
      d.name.toLowerCase().includes(t) ||
      (d.hostname ? d.hostname.toLowerCase().includes(t) : false) ||
      (d.mgmt_ip ? d.mgmt_ip.toLowerCase().includes(t) : false) ||
      d.vendor.toLowerCase().includes(t)
    );
  }).filter((d) => {
    if (!ipFilter.trim()) return true;
    const f = ipFilter.toLowerCase();
    return (d.mgmt_ip ? d.mgmt_ip.toLowerCase().includes(f) : false);
  }).filter((d) => {
    if (portMin !== "" && !Number.isNaN(Number(portMin))) {
      if (d.ssh_port < Number(portMin)) return false;
    }
    if (portMax !== "" && !Number.isNaN(Number(portMax))) {
      if (d.ssh_port > Number(portMax)) return false;
    }
    return true;
  });

  const itemsView = [...itemsFiltered].sort((a, b) => {
    let cmp = 0;
    if (sortBy === "name") {
      cmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    } else if (sortBy === "vendor") {
      cmp = a.vendor.toLowerCase().localeCompare(b.vendor.toLowerCase());
    } else if (sortBy === "ip") {
      const ai = (a.mgmt_ip || "").toLowerCase();
      const bi = (b.mgmt_ip || "").toLowerCase();
      cmp = ai.localeCompare(bi);
    } else if (sortBy === "port") {
      cmp = a.ssh_port - b.ssh_port;
    } else if (sortBy === "active") {
      cmp = Number(a.is_active) - Number(b.is_active);
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Cihazlarım</h2>
        <Button asChild>
          <Link href="/devices/new">Cihaz Ekle</Link>
        </Button>
      </div>
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
        <div className="w-full md:w-40">
          <Input placeholder="IP filtre" value={ipFilter} onChange={(e) => setIpFilter(e.target.value)} />
        </div>
        <div className="w-full md:w-28">
          <Input type="number" placeholder="Port min" value={portMin} onChange={(e) => setPortMin(e.target.value)} />
        </div>
        <div className="w-full md:w-28">
          <Input type="number" placeholder="Port max" value={portMax} onChange={(e) => setPortMax(e.target.value)} />
        </div>
        <div className="w-full md:w-40">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v)}>
            <SelectTrigger><SelectValue placeholder="Sırala" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Ada göre</SelectItem>
              <SelectItem value="vendor">Vendor</SelectItem>
              <SelectItem value="ip">IP</SelectItem>
              <SelectItem value="port">Port</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full md:w-28">
          <Select value={sortDir} onValueChange={(v) => setSortDir(v)}>
            <SelectTrigger><SelectValue placeholder="Yön" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Artan</SelectItem>
              <SelectItem value="desc">Azalan</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { applyQueryToUrl(0); setOffset(0); load(); }}>Ara</Button>
        <Button variant="outline" asChild>
          <Link href="/vendors">Vendorları Yönet</Link>
        </Button>
      </div>
      <div className="flex gap-2 my-3">
        <Button variant="outline" disabled={offset === 0} onClick={() => { const next = Math.max(0, offset - limit); applyQueryToUrl(next); setOffset(next); load(); }}>Önceki</Button>
        <Button variant="outline" onClick={() => { const next = offset + limit; applyQueryToUrl(next); setOffset(next); load(); }}>Sonraki</Button>
      </div>
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      <div className="overflow-x-auto">
        <div className="flex items-center justify-end mb-2">
          <Input className="w-64" placeholder="Tablo arama (ad/hostname/IP/vendor)" value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} />
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-2">Ad</th>
              <th className="text-left py-2 px-2">Hostname</th>
              <th className="text-left py-2 px-2">Vendor</th>
              <th className="text-left py-2 px-2">IP</th>
              <th className="text-left py-2 px-2">Port</th>
              <th className="text-left py-2 px-2">Aktif</th>
              <th className="text-left py-2 px-2">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {itemsView.map((d) => (
              <tr key={d.id} className="border-b">
                <td className="py-2 px-2 font-medium">
                  <Link href={`/devices/${d.id}`}>{d.name}</Link>
                </td>
                <td className="py-2 px-2">{d.hostname || "-"}</td>
                <td className="py-2 px-2">
                  <Badge className={cn("cursor-pointer gap-1", vendorToneClasses(d.vendor))} onClick={() => { setVendor(d.vendor); setQ(""); setOffset(0); setTimeout(() => { applyQueryToUrl(0); load(); }, 0); }}>
                    {vendorIcon(d.vendor)}
                    <span>{d.vendor}</span>
                  </Badge>
                </td>
                <td className="py-2 px-2">{d.mgmt_ip || "-"}</td>
                <td className="py-2 px-2">{d.ssh_port}</td>
                <td className="py-2 px-2">{d.is_active ? "Evet" : "Hayır"}</td>
                <td className="py-2 px-2">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/devices/${d.id}/status`}>Durum</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/devices/${d.id}/interfaces`}>Arayüzler</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/devices/${d.id}/inventory`}>Envanter</Link>
                    </Button>
                    <Button size="sm" onClick={() => triggerBackup(d.id)}>Manuel Yedek</Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/backups/${d.id}`}>Geçmiş</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/devices/${d.id}/edit`}>Düzenle</Link>
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => deleteDevice(d.id)}>Sil</Button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td className="py-4 px-2 text-muted-foreground" colSpan={6}>Kayıt yok</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
  
