"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { apiFetch, logout, cn, getToken } from "../../lib/utils";
import { AppShell } from "../../components/layout/app-shell";
import { Badge } from "../../components/ui/badge";
import { vendorToneClasses, vendorIcon } from "../../lib/vendor";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Edit, Trash2, Eye, Save, Download } from "lucide-react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../components/ui/table";

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
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
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
  const [totalCount, setTotalCount] = useState<number | null>(null);
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

  async function loadTotal() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/stats/overview`);
      if (!res.ok) return;
      const j = await res.json();
      setTotalCount((j?.devices?.total as number) ?? null);
    } catch {}
  }

  useEffect(() => { load(); loadVendors(); }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("devices_search_history");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setSearchHistory(arr.filter((x) => typeof x === "string").slice(0, 10));
      }
    } catch {}
    loadTotal();
  }, []);

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
      if (q && q.trim()) {
        setSearchHistory((prev) => {
          const next = [q.trim(), ...prev.filter((x) => x.trim() !== q.trim())].slice(0, 10);
          try { localStorage.setItem("devices_search_history", JSON.stringify(next)); } catch {}
          return next;
        });
      }
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

  const currentPage = Math.floor(offset / limit) + 1;
  const pages = [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2].filter((p) => p >= 1);

  return (
    <>
      <div className="flex items-center justify-between pt-6">
        <h2 className="text-2xl font-semibold">Cihazlarım</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => {
            const header = ["Ad","Hostname","Vendor","IP","Port","Aktif"];
            const escape = (v: string) => `"${String(v).replace(/\"/g, '\"\"')}"`;
            const rows = itemsView.map((d) => [
              d.name,
              d.hostname || "",
              d.vendor,
              d.mgmt_ip || "",
              String(d.ssh_port),
              d.is_active ? "Evet" : "Hayır",
            ]);
            const csv = [header, ...rows].map((r) => r.map((x) => escape(x)).join(",")).join("\r\n");
            const bom = "\ufeff";
            const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `devices_${new Date().toISOString().slice(0,19).replace(/[:T]/g,"-")}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
          }}>
            <Download className="mr-2 h-4 w-4" />
            Excele Aktar
          </Button>
          <Button asChild>
            <Link href="/devices/new">Cihaz Ekle</Link>
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      <div className="overflow-x-auto px-4 sm:px-6 lg:px-8 mt-4">
        <div className="rounded-xl border border-border/60 bg-card p-2 sm:p-3 md:p-4">
          <Table>
            <TableHeader className="bg-muted/30 [&_tr]:border-border/70">
              <TableRow>
                <TableHead className="h-12 px-4">Ad</TableHead>
                <TableHead className="h-12 px-4">Hostname</TableHead>
                <TableHead className="h-12 px-4">Vendor</TableHead>
                <TableHead className="h-12 px-4">IP</TableHead>
                <TableHead className="h-12 px-4">Port</TableHead>
                <TableHead className="h-12 px-4">Aktif</TableHead>
                <TableHead className="h-12 px-4">İşlemler</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemsView.map((d) => (
                <TableRow key={d.id} className="border-b border-border/50 hover:bg-muted/50 hover:text-foreground transition-colors">
                  <TableCell className="px-4 py-3 font-medium">
                    <Link href={`/devices/${d.id}`}>{d.name}</Link>
                  </TableCell>
                  <TableCell className="px-4 py-3">{d.hostname || "-"}</TableCell>
                  <TableCell className="px-4 py-3">
                    <Badge className={cn("cursor-pointer gap-1", vendorToneClasses(d.vendor))} onClick={() => { setVendor(d.vendor); setQ(""); setOffset(0); setTimeout(() => { applyQueryToUrl(0); load(); }, 0); }}>
                      {vendorIcon(d.vendor)}
                      <span>{d.vendor}</span>
                    </Badge>
                  </TableCell>
                  <TableCell className="px-4 py-3">{d.mgmt_ip || "-"}</TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">{d.ssh_port}</TableCell>
                  <TableCell className="px-4 py-3">{d.is_active ? "Evet" : "Hayır"}</TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="icon" variant="ghost" asChild className="shadow-none border-none bg-transparent hover:bg-transparent transition-transform hover:scale-[1.02] active:scale-[0.98]" title="Görüntüle">
                        <Link href={`/devices/${d.id}`}><Eye className="h-4 w-4" /></Link>
                      </Button>
                      <Button size="icon" variant="ghost" asChild className="shadow-none border-none bg-transparent hover:bg-transparent transition-transform hover:scale-[1.02] active:scale-[0.98]" title="Düzenle">
                        <Link href={`/devices/${d.id}/edit`}><Edit className="h-4 w-4" /></Link>
                      </Button>
                      {(() => {
                        const qs = new URLSearchParams();
                        qs.set("sortBy", "name");
                        qs.set("sortDir", "asc");
                        qs.set("limit", "10");
                        qs.set("offset", "0");
                        qs.set("ts", String(Date.now()));
                        qs.set("uid", Math.random().toString(36).slice(2));
                        return (
                          <Button size="icon" variant="ghost" onClick={() => router.push(`/backups/${d.id}/manual?${qs.toString()}`)} className="shadow-none border-none bg-transparent hover:bg-transparent transition-transform hover:scale-[1.02] active:scale-[0.98]" title="Yedek Al">
                            <Save className="h-4 w-4" />
                          </Button>
                        );
                      })()}
                      <Button size="icon" variant="ghost" onClick={() => deleteDevice(d.id)} className="shadow-none border-none bg-transparent hover:bg-transparent text-destructive transition-transform hover:scale-[1.02] active:scale-[0.98]" title="Sil">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell className="py-6 px-4 text-muted-foreground" colSpan={7}>Kayıt yok</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {typeof totalCount === "number" ? `Toplam cihaz: ${totalCount}` : "Toplam cihaz sayısı alınamadı"}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { const next = Math.max(0, offset - limit); applyQueryToUrl(next); setOffset(next); load(); }}
              disabled={offset === 0}
              aria-label="Önceki sayfa"
              className="shadow-none transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="hidden sm:flex items-center gap-1">
              {pages.map((p) => (
                <Button
                  key={p}
                  variant={p === currentPage ? "default" : "ghost"}
                  size="sm"
                  aria-current={p === currentPage ? "page" : undefined}
                  onClick={() => { const next = (p - 1) * limit; applyQueryToUrl(next); setOffset(next); load(); }}
                  className="shadow-none"
                >
                  {p}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { const next = offset + limit; applyQueryToUrl(next); setOffset(next); load(); }}
              aria-label="Sonraki sayfa"
              className="shadow-none transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
  
