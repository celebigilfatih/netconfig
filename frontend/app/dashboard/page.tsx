"use client";
import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
import { Donut } from "../../components/charts/donut";
import { apiFetch, logout, getToken, cn } from "../../lib/utils";
import { AppShell } from "../../components/layout/app-shell";
import { Badge } from "../../components/ui/badge";
import { vendorToneClasses, vendorIcon } from "../../lib/vendor";

type Device = {
  id: string;
  name: string;
  vendor: string;
  is_active: boolean;
};

type OverviewItem = { id: string; name: string; vendor: string; isActive: boolean; lastTs: string | null; uptimeTicks: number | null; cpuPercent: number | null; memUsedPercent: number | null };
type AlarmItem = { id: string; device_id: string; type: string; severity: string; message: string; acknowledged: boolean; created_at: string; resolved_at: string | null };
type AggTrendItem = { ts: string; avgCpuPercent: number | null; avgMemUsedPercent: number | null };
type Aggregated = {
  deviceCount: number;
  activeDeviceCount: number;
  metricsDeviceCount: number;
  avgCpuPercent: number | null;
  avgMemUsedPercent: number | null;
  avgUptimeHours: number | null;
  topCpu: Array<{ deviceId: string; ts: string; cpuPercent: number }>;
  topMem: Array<{ deviceId: string; ts: string; memUsedPercent: number }>;
  trend: AggTrendItem[];
};

function DashboardContent() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [statsExtra, setStatsExtra] = useState<{ backups24h?: { success: number; failed: number }; pendingExecutions?: number; lastBackupTs?: string | null }>({});
  const [overview, setOverview] = useState<OverviewItem[]>([]);
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [agg, setAgg] = useState<Aggregated | null>(null);
  const [alarmSeverity, setAlarmSeverity] = useState<string>("all");
  const [alarmType, setAlarmType] = useState<string>("all");
  const [overVendor, setOverVendor] = useState<string>("all");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [critOnly, setCritOnly] = useState(false);
  const [cpuThreshold, setCpuThreshold] = useState(75);
  const [memThreshold, setMemThreshold] = useState(75);
  const [overActiveOnly, setOverActiveOnly] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  function applyQueryToUrl() {
    const params = new URLSearchParams();
    if (overVendor && overVendor !== "all") params.set("overVendor", overVendor);
    if (overActiveOnly) params.set("overActive", "true");
    if (onlyHigh) params.set("onlyHigh", "true");
    if (critOnly) params.set("critOnly", "true");
    params.set("cpuTh", String(cpuThreshold));
    params.set("memTh", String(memThreshold));
    if (alarmSeverity && alarmSeverity !== "all") params.set("alarmSev", alarmSeverity);
    if (alarmType && alarmType !== "all") params.set("alarmType", alarmType);
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  }

  async function load() {
    setError("");
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/devices?limit=50`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Veri alınamadı");
        return;
      }
      const data = await res.json();
      setDevices(data.items || []);
      const sRes = await apiFetch(`/stats/overview`);
      if (sRes.ok) {
        const s = await sRes.json();
        setStatsExtra({ backups24h: s.backups24h, pendingExecutions: s.pendingExecutions, lastBackupTs: s.lastBackupTs });
      }
      const mRes = await apiFetch(`/monitoring/overview`);
      if (mRes.ok) {
        const j = await mRes.json();
        setOverview(Array.isArray(j.items) ? j.items : []);
      }
      const agRes = await apiFetch(`/monitoring/metrics/aggregated?range=24h&points=50&top=5`);
      if (agRes.ok) {
        const a = await agRes.json();
        setAgg(a);
      }
      const aRes = await apiFetch(`/alarms?status=active&limit=9`);
      if (aRes.ok) {
        const a = await aRes.json();
        setAlarms(Array.isArray(a.items) ? a.items : []);
      }
    } catch {
      setError("Ağ hatası");
    }
  }

  useEffect(() => {
    const ov = searchParams.get("overVendor");
    const oa = searchParams.get("overActive");
    const oh = searchParams.get("onlyHigh");
    const cr = searchParams.get("critOnly");
    const cth = searchParams.get("cpuTh");
    const mth = searchParams.get("memTh");
    const as = searchParams.get("alarmSev");
    const at = searchParams.get("alarmType");
    if (ov) setOverVendor(ov);
    if (oa === "true") setOverActiveOnly(true);
    if (oh === "true") setOnlyHigh(true);
    if (cr === "true") setCritOnly(true);
    if (cth && !Number.isNaN(Number(cth))) setCpuThreshold(Math.max(0, Math.min(100, Number(cth))));
    if (mth && !Number.isNaN(Number(mth))) setMemThreshold(Math.max(0, Math.min(100, Number(mth))));
    if (as) setAlarmSeverity(as);
    if (at) setAlarmType(at);

    if (!ov) {
      try {
        const lsOv = localStorage.getItem("dashboard_overVendor");
        if (lsOv) setOverVendor(lsOv);
      } catch {}
    }
    if (oh !== "true") {
      try {
        const lsOh = localStorage.getItem("dashboard_onlyHigh");
        if (lsOh === "true") setOnlyHigh(true);
      } catch {}
    }
    if (cr !== "true") {
      try {
        const lsCr = localStorage.getItem("dashboard_critOnly");
        if (lsCr === "true") setCritOnly(true);
      } catch {}
    }
    if (!(cth && !Number.isNaN(Number(cth)))) {
      try {
        const lsCth = localStorage.getItem("dashboard_cpuTh");
        if (lsCth && !Number.isNaN(Number(lsCth))) setCpuThreshold(Math.max(0, Math.min(100, Number(lsCth))));
      } catch {}
    }
    if (!(mth && !Number.isNaN(Number(mth)))) {
      try {
        const lsMth = localStorage.getItem("dashboard_memTh");
        if (lsMth && !Number.isNaN(Number(lsMth))) setMemThreshold(Math.max(0, Math.min(100, Number(lsMth))));
      } catch {}
    }
    (async () => {
      try {
        const res = await apiFetch("/alarms/preferences");
        if (res.ok) {
          const j = await res.json();
          if (!as) setAlarmSeverity(j.alarmSeverity || "all");
          if (!at) setAlarmType(j.alarmType || "all");
        }
      } catch {}
    })();
    setTimeout(() => { load(); }, 0);
  }, []);

  useEffect(() => {
    applyQueryToUrl();
  }, [overVendor, overActiveOnly, onlyHigh, critOnly, cpuThreshold, memThreshold, alarmSeverity, alarmType]);

  useEffect(() => {
    try {
      localStorage.setItem("dashboard_overVendor", overVendor);
      localStorage.setItem("dashboard_overActive", String(overActiveOnly));
      localStorage.setItem("dashboard_onlyHigh", String(onlyHigh));
      localStorage.setItem("dashboard_critOnly", String(critOnly));
      localStorage.setItem("dashboard_cpuTh", String(cpuThreshold));
      localStorage.setItem("dashboard_memTh", String(memThreshold));
    } catch {}
  }, [overVendor, overActiveOnly, onlyHigh, critOnly, cpuThreshold, memThreshold]);

  useEffect(() => {
    (async () => {
      try {
        await apiFetch("/alarms/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alarmSeverity, alarmType }),
        });
      } catch {}
    })();
  }, [alarmSeverity, alarmType]);

  const stats = useMemo(() => {
    const total = devices.length;
    const active = devices.filter((d) => d.is_active).length;
    const vg = (v: string) => devices.filter((d) => d.vendor === v).length;
    return {
      total,
      active,
      fortigate: vg("fortigate"),
      cisco: vg("cisco_ios"),
      mikrotik: vg("mikrotik"),
    };
  }, [devices]);

  const vendorsOverview = useMemo(() => Array.from(new Set(overview.map((i) => i.vendor))), [overview]);
  const nameMap = useMemo(() => Object.fromEntries(devices.map(d => [d.id, d.name])), [devices]);
  const alarmTypes = useMemo(() => Array.from(new Set(alarms.map((a) => a.type))), [alarms]);
  const alarmsFiltered = useMemo(() => {
    return alarms.filter((a) => {
      const okS = alarmSeverity === "all" ? true : a.severity === alarmSeverity;
      const okT = alarmType === "all" ? true : a.type === alarmType;
      return okS && okT;
    });
  }, [alarms, alarmSeverity, alarmType]);
  const overviewFiltered = useMemo(() => {
    return overview.filter((i) => {
      const okV = overVendor && overVendor !== "all" ? i.vendor === overVendor : true;
      const okA = overActiveOnly ? i.isActive : true;
      const thCpu = critOnly ? 90 : cpuThreshold;
      const thMem = critOnly ? 90 : memThreshold;
      const isHigh = ((typeof i.cpuPercent === "number" && i.cpuPercent >= thCpu) || (typeof i.memUsedPercent === "number" && i.memUsedPercent >= thMem));
      const okH = (onlyHigh || critOnly) ? isHigh : true;
      return okV && okA && okH;
    });
  }, [overview, overVendor, overActiveOnly, onlyHigh, critOnly, cpuThreshold, memThreshold]);

  return (
    <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Genel Bakış</h2>
          <div className="flex gap-2">
            <Button asChild>
              <Link href="/devices/new">Yeni Cihaz</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/devices">Tüm Cihazlar</Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={(!overActiveOnly && overVendor === "all") ? "default" : "outline"} onClick={() => { setOverVendor("all"); setOverActiveOnly(false); }}>Tümü</Button>
          <Button size="sm" variant={overActiveOnly ? "default" : "outline"} onClick={() => setOverActiveOnly(true)}>Aktif</Button>
          <Button size="sm" variant={overVendor === "fortigate" ? "default" : "outline"} onClick={() => setOverVendor("fortigate")}>FortiGate</Button>
          <Button size="sm" variant={overVendor === "cisco_ios" ? "default" : "outline"} onClick={() => setOverVendor("cisco_ios")}>Cisco IOS</Button>
          <Button size="sm" variant={overVendor === "mikrotik" ? "default" : "outline"} onClick={() => setOverVendor("mikrotik")}>MikroTik</Button>
          <Button size="sm" variant={(onlyHigh && !critOnly) ? "default" : "outline"} onClick={() => setOnlyHigh(!onlyHigh)}>Yüksek</Button>
          <Button size="sm" variant={critOnly ? "default" : "outline"} onClick={() => setCritOnly(!critOnly)}>Kritik</Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>NetCFG</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-muted-foreground">Cihazları keşfet, yedekleri takip et</div>
                  <div className="mt-2 flex gap-2">
                    <Button asChild>
                      <Link href="/devices">Cihazlara Git</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href="/backups">Yedekler</Link>
                    </Button>
                  </div>
                </div>
                <div className="hidden md:block text-right">
                  <div className="text-sm">Toplam Cihaz</div>
                  <div className="text-3xl font-bold">{stats.total}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Yedek Başarı Oranı</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold">
                  {(() => {
                    const s = statsExtra.backups24h?.success ?? 0;
                    const f = statsExtra.backups24h?.failed ?? 0;
                    const r = s + f > 0 ? Math.round((s / (s + f)) * 100) : 0;
                    return r;
                  })()}%
                </div>
                <div className="text-sm text-muted-foreground">Hedef 100%</div>
              </div>
              <div className="mt-3">
                <Progress value={(statsExtra.backups24h?.success ?? 0) / Math.max(1, (statsExtra.backups24h?.success ?? 0) + (statsExtra.backups24h?.failed ?? 0)) * 100} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Vendor Dağılımı</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Donut segments={[
                  { value: stats.fortigate, color: "#22c55e" },
                  { value: stats.cisco, color: "#3b82f6" },
                  { value: stats.mikrotik, color: "#f59e0b" },
                ]} size={120} thickness={18} />
                <div className="text-sm">
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{backgroundColor: "#22c55e"}} /> FortiGate: {stats.fortigate}</div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{backgroundColor: "#3b82f6"}} /> Cisco IOS: {stats.cisco}</div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm" style={{backgroundColor: "#f59e0b"}} /> MikroTik: {stats.mikrotik}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <Card className="md:col-span-2 xl:col-span-2">
            <CardHeader>
              <CardTitle>Son Alarmlar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-3 mb-3">
                  <div className="w-36">
                    <Select value={alarmSeverity} onValueChange={(v) => setAlarmSeverity(v)}>
                      <SelectTrigger><SelectValue placeholder="Önem" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">(Tümü)</SelectItem>
                        <SelectItem value="warning">Uyarı</SelectItem>
                        <SelectItem value="critical">Kritik</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-44">
                    <Select value={alarmType} onValueChange={(v) => setAlarmType(v)}>
                      <SelectTrigger><SelectValue placeholder="Tip" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">(Tümü)</SelectItem>
                        {alarmTypes.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" asChild><Link href="/alarms">Tüm Alarmlar</Link></Button>
                </div>
                {alarmsFiltered.length === 0 ? (
                  <div className="text-sm text-muted-foreground">Kayıt yok</div>
                ) : (
                  <div className="space-y-2">
                    {alarmsFiltered.map((it) => (
                      <div key={it.id} className="grid grid-cols-1 md:grid-cols-5 items-center gap-2 rounded-md border p-2">
                        <div className="font-medium truncate">{it.message}</div>
                        <div className="text-xs">Tip: {it.type}</div>
                        <div className="text-xs">Önem: {it.severity}</div>
                        <div className="text-xs truncate">Cihaz: {nameMap[it.device_id] || it.device_id}</div>
                        <div className="flex gap-2 md:justify-end">
                          <Button size="sm" variant="outline" asChild><Link href={`/devices/${it.device_id}/status`}>Durum</Link></Button>
                        </div>
                        <div className="text-xs text-muted-foreground md:col-span-5">{new Date(it.created_at).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>CPU Ortalaması</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold">{typeof agg?.avgCpuPercent === "number" ? agg?.avgCpuPercent : "-"}</div>
                <div className="text-sm text-muted-foreground">%</div>
              </div>
              <div className="mt-3">
                <Progress value={typeof agg?.avgCpuPercent === "number" ? agg?.avgCpuPercent : 0} />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Bellek Ortalaması</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold">{typeof agg?.avgMemUsedPercent === "number" ? agg?.avgMemUsedPercent : "-"}</div>
                <div className="text-sm text-muted-foreground">%</div>
              </div>
              <div className="mt-3">
                <Progress value={typeof agg?.avgMemUsedPercent === "number" ? agg?.avgMemUsedPercent : 0} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Yedek (24s)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-3xl font-bold">{statsExtra.backups24h?.success ?? 0}</div>
                <div className="text-sm text-muted-foreground">Başarılı</div>
              </div>
              <div className="mt-2 text-sm">Hatalı: {statsExtra.backups24h?.failed ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Bekleyen İşlemler</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{statsExtra.pendingExecutions ?? 0}</div>
              {statsExtra.lastBackupTs && (
                <div className="text-sm text-muted-foreground mt-1">Son yedek: {new Date(statsExtra.lastBackupTs).toLocaleString()}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Aktif Cihaz</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.active}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>İzleme Özeti</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-3">
                <Select value={overVendor} onValueChange={(v) => setOverVendor(v)}>
                  <SelectTrigger className="w-52"><SelectValue placeholder="Vendor filtre" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">(Hepsi)</SelectItem>
                    {vendorsOverview.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
                  </SelectContent>
                </Select>
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
                <Button variant="outline" onClick={load}>Yenile</Button>
              </div>
              <div className="space-y-3">
                {overviewFiltered.slice(0,6).map((i) => (
                  <div key={i.id} className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{i.name}</div>
                      <Badge className={cn("cursor-pointer gap-1", vendorToneClasses(i.vendor))} onClick={() => setOverVendor(i.vendor)}>
                        {vendorIcon(i.vendor)}
                        <span>{i.vendor}</span>
                      </Badge>
                    </div>
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
                      <div className="text-xs text-muted-foreground">Son ölçüm</div>
                      <div className="text-xs text-muted-foreground">{i.lastTs ? new Date(i.lastTs).toLocaleString() : "-"}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" asChild><Link href={`/devices/${i.id}/status`}>Durum</Link></Button>
                      <Button size="sm" variant="outline" asChild><Link href={`/devices/${i.id}/interfaces`}>Arayüzler</Link></Button>
                      <Button size="sm" variant="outline" asChild><Link href={`/devices/${i.id}/inventory`}>Envanter</Link></Button>
                    </div>
                  </div>
                ))}
                {overview.length === 0 && <div className="text-sm text-muted-foreground">Kayıt yok</div>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top CPU / Bellek</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-2">CPU</div>
                  <div className="space-y-2">
                    {(agg?.topCpu || []).map((r) => (
                      <div key={`cpu-${r.deviceId}`} className="flex items-center gap-2">
                        <span className="flex-1 truncate">{nameMap[r.deviceId] || r.deviceId}</span>
                        <span className="text-sm w-12 text-right">{r.cpuPercent}%</span>
                        <Button size="sm" variant="outline" asChild><Link href={`/devices/${r.deviceId}/status`}>Durum</Link></Button>
                      </div>
                    ))}
                    {(agg?.topCpu || []).length === 0 && (<div className="text-sm text-muted-foreground">Kayıt yok</div>)}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-2">Bellek</div>
                  <div className="space-y-2">
                    {(agg?.topMem || []).map((r) => (
                      <div key={`mem-${r.deviceId}`} className="flex items-center gap-2">
                        <span className="flex-1 truncate">{nameMap[r.deviceId] || r.deviceId}</span>
                        <span className="text-sm w-12 text-right">{r.memUsedPercent}%</span>
                        <Button size="sm" variant="outline" asChild><Link href={`/devices/${r.deviceId}/status`}>Durum</Link></Button>
                      </div>
                    ))}
                    {(agg?.topMem || []).length === 0 && (<div className="text-sm text-muted-foreground">Kayıt yok</div>)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 grid-cols-1">
          <Card>
            <CardHeader>
              <CardTitle>Trend (24s CPU/Bellek)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full overflow-x-auto">
                {agg?.trend && agg.trend.length > 0 ? (
                  <svg width={600} height={120} viewBox={`0 0 600 120`} className="max-w-full">
                    {(() => {
                      const pts = agg.trend;
                      const w = 600;
                      const h = 120;
                      const n = Math.max(1, pts.length - 1);
                      const xFor = (i: number) => Math.round((i / n) * (w - 20)) + 10;
                      const yForCpu = (v: number | null) => {
                        const vv = typeof v === "number" ? v : 0;
                        return Math.round(h - 10 - (vv / 100) * (h - 20));
                      };
                      const yForMem = (v: number | null) => {
                        const vv = typeof v === "number" ? v : 0;
                        return Math.round(h - 10 - (vv / 100) * (h - 20));
                      };
                      const cpuPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yForCpu(p.avgCpuPercent)}`).join(" ");
                      const memPath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yForMem(p.avgMemUsedPercent)}`).join(" ");
                      return (
                        <g>
                          <path d={cpuPath} fill="none" stroke="#3b82f6" strokeWidth={2} />
                          <path d={memPath} fill="none" stroke="#f59e0b" strokeWidth={2} />
                        </g>
                      );
                    })()}
                  </svg>
                ) : (
                  <div className="text-sm text-muted-foreground">Kayıt yok</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        
      </div>
  );
}

export default function DashboardPage() {
  return (
    <AppShell>
      <Suspense fallback={<div />}>
        <DashboardContent />
      </Suspense>
    </AppShell>
  );
}
