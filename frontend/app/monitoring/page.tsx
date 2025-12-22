"use client";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { AppShell } from "../../components/layout/app-shell";
import { apiFetch, logout, getToken, cn } from "../../lib/utils";
import { Badge } from "../../components/ui/badge";
import { Progress } from "../../components/ui/progress";
import { vendorToneClasses, vendorIcon } from "../../lib/vendor";

type Item = { id: string; name: string; vendor: string; isActive: boolean; lastTs: string | null; uptimeTicks: number | null; cpuPercent: number | null; memUsedPercent: number | null };

function formatUptime(ticks: number | null): string {
  if (!ticks || ticks <= 0) return "-";
  const seconds = Math.floor(ticks / 100);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}g ${h}s ${m}d` : h ? `${h}s ${m}d` : `${m}d`;
}

function MonitoringContent() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [vendor, setVendor] = useState<string>("all");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [critOnly, setCritOnly] = useState(false);
  const [cpuThreshold, setCpuThreshold] = useState(75);
  const [memThreshold, setMemThreshold] = useState(75);
  const [activeOnly, setActiveOnly] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshMs, setRefreshMs] = useState(30000);
  const searchParams = useSearchParams();
  const router = useRouter();

  function applyQueryToUrl() {
    const params = new URLSearchParams();
    if (vendor && vendor !== "all") params.set("vendor", vendor);
    if (q) params.set("q", q);
    if (activeOnly) params.set("activeOnly", "true");
    if (onlyHigh) params.set("onlyHigh", "true");
    if (critOnly) params.set("critOnly", "true");
    params.set("cpuTh", String(cpuThreshold));
    params.set("memTh", String(memThreshold));
    if (autoRefresh) params.set("autoRefresh", "true");
    if (refreshMs) params.set("refreshMs", String(refreshMs));
    router.replace(`/monitoring?${params.toString()}`, { scroll: false });
  }

  async function load() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/monitoring/overview`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Veri alınamadı");
        return;
      }
      const j = await res.json();
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch {
      setError("Ağ hatası");
    }
  }

  useEffect(() => {
    const v = searchParams.get("vendor");
    const q0 = searchParams.get("q");
    const ao = searchParams.get("activeOnly");
    const oh = searchParams.get("onlyHigh");
    const cr = searchParams.get("critOnly");
    const cth = searchParams.get("cpuTh");
    const mth = searchParams.get("memTh");
    const ar = searchParams.get("autoRefresh");
    const rm = searchParams.get("refreshMs");
    if (v) setVendor(v);
    if (q0) setQ(q0);
    if (ao === "true") setActiveOnly(true);
    if (oh === "true") setOnlyHigh(true);
    if (cr === "true") setCritOnly(true);
    if (cth && !Number.isNaN(Number(cth))) setCpuThreshold(Math.max(0, Math.min(100, Number(cth))));
    if (mth && !Number.isNaN(Number(mth))) setMemThreshold(Math.max(0, Math.min(100, Number(mth))));
    if (ar === "true") setAutoRefresh(true);
    if (rm && !Number.isNaN(Number(rm))) setRefreshMs(Number(rm));
    setTimeout(() => { load(); }, 0);
  }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => { load(); }, refreshMs);
    return () => clearInterval(t);
  }, [autoRefresh, refreshMs]);

  useEffect(() => {
    applyQueryToUrl();
  }, [vendor, activeOnly, onlyHigh, critOnly, cpuThreshold, memThreshold, autoRefresh, refreshMs]);

  useEffect(() => {
    try {
      localStorage.setItem("monitoring_activeOnly", String(activeOnly));
      localStorage.setItem("monitoring_onlyHigh", String(onlyHigh));
      localStorage.setItem("monitoring_critOnly", String(critOnly));
      localStorage.setItem("monitoring_cpuTh", String(cpuThreshold));
      localStorage.setItem("monitoring_memTh", String(memThreshold));
    } catch {}
  }, [activeOnly, onlyHigh, critOnly, cpuThreshold, memThreshold]);

  useEffect(() => {
    const t = setTimeout(() => { applyQueryToUrl(); }, 400);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const v = searchParams.get("vendor");
    const ao = searchParams.get("activeOnly");
    const oh = searchParams.get("onlyHigh");
    const cr = searchParams.get("critOnly");
    const cth = searchParams.get("cpuTh");
    const mth = searchParams.get("memTh");
    if (!v) {
      try {
        const lsV = localStorage.getItem("monitoring_vendor");
        if (lsV) setVendor(lsV);
      } catch {}
    }
    if (ao !== "true") {
      try {
        const lsAo = localStorage.getItem("monitoring_activeOnly");
        if (lsAo === "true") setActiveOnly(true);
      } catch {}
    }
    if (oh !== "true") {
      try {
        const lsOh = localStorage.getItem("monitoring_onlyHigh");
        if (lsOh === "true") setOnlyHigh(true);
      } catch {}
    }
    if (cr !== "true") {
      try {
        const lsCr = localStorage.getItem("monitoring_critOnly");
        if (lsCr === "true") setCritOnly(true);
      } catch {}
    }
    if (!(cth && !Number.isNaN(Number(cth)))) {
      try {
        const lsCth = localStorage.getItem("monitoring_cpuTh");
        if (lsCth && !Number.isNaN(Number(lsCth))) setCpuThreshold(Math.max(0, Math.min(100, Number(lsCth))));
      } catch {}
    }
    if (!(mth && !Number.isNaN(Number(mth)))) {
      try {
        const lsMth = localStorage.getItem("monitoring_memTh");
        if (lsMth && !Number.isNaN(Number(lsMth))) setMemThreshold(Math.max(0, Math.min(100, Number(lsMth))));
      } catch {}
    }
  }, []);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      const okV = vendor && vendor !== "all" ? i.vendor === vendor : true;
      const okQ = q ? (i.name.toLowerCase().includes(q.toLowerCase())) : true;
      const okA = activeOnly ? i.isActive : true;
      const thCpu = critOnly ? 90 : cpuThreshold;
      const thMem = critOnly ? 90 : memThreshold;
      const isHigh = ((typeof i.cpuPercent === "number" && i.cpuPercent >= thCpu) || (typeof i.memUsedPercent === "number" && i.memUsedPercent >= thMem));
      const okH = (onlyHigh || critOnly) ? isHigh : true;
      return okV && okQ && okA && okH;
    });
  }, [items, vendor, q, activeOnly, onlyHigh, critOnly, cpuThreshold, memThreshold]);

  const vendors = useMemo(() => {
    const set = new Set(items.map((i) => i.vendor));
    return Array.from(set);
  }, [items]);

  return (
    <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Cihaz İzleme</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm">Oto-güncelle</label>
            <input type="checkbox" className="h-4 w-4" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            <Select value={String(refreshMs)} onValueChange={(v) => setRefreshMs(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15000">15 sn</SelectItem>
                <SelectItem value="30000">30 sn</SelectItem>
                <SelectItem value="60000">60 sn</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={load}>Yenile</Button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={vendor} onValueChange={(v) => setVendor(v)}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Vendor filtre" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">(Hepsi)</SelectItem>
              {vendors.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
            </SelectContent>
          </Select>
          <label className="text-sm">Aktif</label>
          <input type="checkbox" className="h-4 w-4" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
          <div className="flex-1">
            <Input placeholder="Cihaz adı ara" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="text-sm">Yüksek kullanım</label>
          <input type="checkbox" className="h-4 w-4" checked={onlyHigh} onChange={(e) => setOnlyHigh(e.target.checked)} />
          <label className="text-sm">Kritik</label>
          <input type="checkbox" className="h-4 w-4" checked={critOnly} onChange={(e) => setCritOnly(e.target.checked)} />
          <div className="w-28">
            <Input type="number" min={0} max={100} step={1} disabled={critOnly} placeholder="CPU %" value={String(cpuThreshold)} onChange={(e) => setCpuThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
          </div>
          <div className="w-28">
            <Input type="number" min={0} max={100} step={1} disabled={critOnly} placeholder="RAM %" value={String(memThreshold)} onChange={(e) => setMemThreshold(Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <Card key={i.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{i.name}</CardTitle>
                  <Badge className={cn("cursor-pointer gap-1", vendorToneClasses(i.vendor))} onClick={() => { setVendor(i.vendor); setQ(""); try { localStorage.setItem("monitoring_vendor", i.vendor); } catch {} }}>
                    {vendorIcon(i.vendor)}
                    <span>{i.vendor}</span>
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    {typeof i.cpuPercent === "number" && i.cpuPercent >= 90 && (
                      <Badge className="bg-red-100 text-red-700 border-red-200">CPU çok yüksek</Badge>
                    )}
                    {typeof i.cpuPercent === "number" && i.cpuPercent >= cpuThreshold && i.cpuPercent < 90 && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200">CPU yüksek</Badge>
                    )}
                    {typeof i.memUsedPercent === "number" && i.memUsedPercent >= 90 && (
                      <Badge className="bg-red-100 text-red-700 border-red-200">Bellek çok yüksek</Badge>
                    )}
                    {typeof i.memUsedPercent === "number" && i.memUsedPercent >= memThreshold && i.memUsedPercent < 90 && (
                      <Badge className="bg-amber-100 text-amber-700 border-amber-200">Bellek yüksek</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm">CPU</div>
                    <div className="text-sm text-muted-foreground">{typeof i.cpuPercent === "number" ? `${i.cpuPercent}%` : "-"}</div>
                  </div>
                  <Progress value={typeof i.cpuPercent === "number" ? i.cpuPercent : 0} />
                  <div className="flex items-center justify-between">
                    <div className="text-sm">Bellek</div>
                    <div className="text-sm text-muted-foreground">{typeof i.memUsedPercent === "number" ? `${i.memUsedPercent}%` : "-"}</div>
                  </div>
                  <Progress value={typeof i.memUsedPercent === "number" ? i.memUsedPercent : 0} />
                  <div className="flex items-center justify-between">
                    <div className="text-sm">Uptime</div>
                    <div className="text-sm text-muted-foreground">{formatUptime(i.uptimeTicks)}</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">Son ölçüm</div>
                    <div className="text-xs text-muted-foreground">{i.lastTs ? new Date(i.lastTs).toLocaleString() : "-"}</div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Button asChild variant="outline" size="sm"><Link href={`/devices/${i.id}/status`}>Durum</Link></Button>
                    <Button asChild variant="outline" size="sm"><Link href={`/devices/${i.id}/interfaces`}>Arayüzler</Link></Button>
                    <Button asChild variant="outline" size="sm"><Link href={`/devices/${i.id}/inventory`}>Envanter</Link></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && <div className="text-sm text-muted-foreground">Kayıt yok</div>}
        </div>
      </div>
  );
}

export default function MonitoringPage() {
  return (
    <AppShell>
      <Suspense fallback={<div />}>
        <MonitoringContent />
      </Suspense>
    </AppShell>
  );
}
