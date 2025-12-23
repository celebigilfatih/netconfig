"use client";
import { useEffect, useMemo, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../components/ui/select";
import { Input } from "../../components/ui/input";
const Donut = dynamic(() => import("../../components/charts/donut").then(m => m.Donut), { ssr: false });
import { apiFetch, logout, getToken, cn } from "../../lib/utils";
import { AppShell } from "../../components/layout/app-shell";
import { LayoutDashboard, Bell, CheckCircle, History, Clock, Server, BarChart3, ListChecks, Lightbulb } from "lucide-react";

type Device = {
  id: string;
  name: string;
  vendor: string;
  is_active: boolean;
};

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

type DeviceBackupOverviewItem = {
  deviceId: string;
  name: string;
  vendor: string;
  lastTs: string | null;
  lastSuccess: boolean | null;
  lastError: string | null;
  counts24h: { success: number; failed: number };
  counts7d: { success: number; failed: number };
  counts30d: { success: number; failed: number };
};


function DashboardContent() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [statsExtra, setStatsExtra] = useState<{ backups24h?: { success: number; failed: number }; pendingExecutions?: number; lastBackupTs?: string | null }>({});
  
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [agg, setAgg] = useState<Aggregated | null>(null);
  const [byDevice, setByDevice] = useState<DeviceBackupOverviewItem[]>([]);
  const [alarmSeverity, setAlarmSeverity] = useState<string>("all");
  const [alarmType, setAlarmType] = useState<string>("all");
  
  const searchParams = useSearchParams();
  const router = useRouter();

  function applyQueryToUrl() {
    const params = new URLSearchParams();
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
      const agRes = await apiFetch(`/monitoring/metrics/aggregated?range=24h&points=50&top=5`);
      if (agRes.ok) {
        const a = await agRes.json();
        setAgg(a);
      }
      const boRes = await apiFetch(`/stats/backup_overview_by_device`);
      if (boRes.ok) {
        const bo = await boRes.json();
        setByDevice(Array.isArray(bo.items) ? bo.items : []);
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
    const as = searchParams.get("alarmSev");
    const at = searchParams.get("alarmType");
    if (as) setAlarmSeverity(as);
    if (at) setAlarmType(at);

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
  }, [alarmSeverity, alarmType]);

  

  // removed obsolete localStorage syncing for overview filters

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

  const nameMap = useMemo(() => Object.fromEntries(devices.map(d => [d.id, d.name])), [devices]);
  const alarmTypes = useMemo(() => Array.from(new Set(alarms.map((a) => a.type))), [alarms]);
  const alarmsFiltered = useMemo(() => {
    return alarms.filter((a) => {
      const okS = alarmSeverity === "all" ? true : a.severity === alarmSeverity;
      const okT = alarmType === "all" ? true : a.type === alarmType;
      return okS && okT;
    });
  }, [alarms, alarmSeverity, alarmType]);
  const recentBackups = useMemo(() => {
    const items = byDevice.filter(x => !!x.lastTs).slice().sort((a, b) => (new Date(b.lastTs as string).getTime() - new Date(a.lastTs as string).getTime()));
    return items.slice(0, 5);
  }, [byDevice]);
  const suggestions = useMemo(() => {
    const list: string[] = [];
    const pend = statsExtra.pendingExecutions || 0;
    if (pend > 0) list.push(`Bekleyen işlemler: ${pend}`);
    const staleCut = Date.now() - 7 * 24 * 3600 * 1000;
    const stale = byDevice.filter(x => !x.lastTs || new Date(x.lastTs).getTime() < staleCut).length;
    if (stale > 0) list.push(`7g içinde yedek alınmayan cihaz: ${stale}`);
    const failed24 = byDevice.filter(x => (x.counts24h?.failed || 0) > 0).length;
    if (failed24 > 0) list.push(`Son 24s başarısız yedek: ${failed24}`);
    const highCpu = (agg?.topCpu || []).filter(r => r.cpuPercent >= 80).slice(0, 3).map(r => nameMap[r.deviceId] || r.deviceId);
    if (highCpu.length) list.push(`Yüksek CPU: ${highCpu.join(', ')}`);
    const highMem = (agg?.topMem || []).filter(r => r.memUsedPercent >= 80).slice(0, 3).map(r => nameMap[r.deviceId] || r.deviceId);
    if (highMem.length) list.push(`Yüksek RAM: ${highMem.join(', ')}`);
    return list;
  }, [statsExtra, byDevice, agg, nameMap]);
  

  return (
    <div className="flex flex-col gap-3">
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

        {/* removed İzleme Özeti filtre bar */}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><LayoutDashboard className="h-5 w-5" />NetCFG</CardTitle>
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
              <CardTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5" />Yedek Başarı Oranı</CardTitle>
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
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Vendor Dağılımı</CardTitle>
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

        <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
          <Card className="md:col-span-2 xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Son Alarmlar</CardTitle>
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
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Sistem Ortalamaları</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div>
                  <div className="flex items-center justify-between"><div className="text-sm text-muted-foreground">CPU</div><div className="text-2xl font-bold">{typeof agg?.avgCpuPercent === "number" ? agg?.avgCpuPercent : "-"}</div></div>
                  <div className="mt-2"><Progress value={typeof agg?.avgCpuPercent === "number" ? agg?.avgCpuPercent : 0} /></div>
                </div>
                <div>
                  <div className="flex items-center justify-between"><div className="text-sm text-muted-foreground">RAM</div><div className="text-2xl font-bold">{typeof agg?.avgMemUsedPercent === "number" ? agg?.avgMemUsedPercent : "-"}</div></div>
                  <div className="mt-2"><Progress value={typeof agg?.avgMemUsedPercent === "number" ? agg?.avgMemUsedPercent : 0} /></div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Yedek (24s)</CardTitle>
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
              <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Bekleyen İşlemler</CardTitle>
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
              <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5" />Aktif Cihaz</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5" />Öneriler</CardTitle>
            </CardHeader>
            <CardContent>
              {suggestions.length === 0 ? (
                <div className="text-sm text-muted-foreground">Öneri yok</div>
              ) : (
                <ul className="space-y-2">
                  {suggestions.map((s, idx) => (
                    <li key={`sug-${idx}`} className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Top CPU / Bellek</CardTitle>
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
                        <div className="h-2 w-24 bg-muted rounded overflow-hidden">
                          <div className="h-2" style={{ width: `${Math.max(0, Math.min(100, r.cpuPercent))}%`, backgroundColor: "#3b82f6" }} />
                        </div>
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
                        <div className="h-2 w-24 bg-muted rounded overflow-hidden">
                          <div className="h-2" style={{ width: `${Math.max(0, Math.min(100, r.memUsedPercent))}%`, backgroundColor: "#f59e0b" }} />
                        </div>
                        <Button size="sm" variant="outline" asChild><Link href={`/devices/${r.deviceId}/status`}>Durum</Link></Button>
                      </div>
                    ))}
                    {(agg?.topMem || []).length === 0 && (<div className="text-sm text-muted-foreground">Kayıt yok</div>)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Son Yedekler</CardTitle>
            </CardHeader>
            <CardContent>
              {recentBackups.length === 0 ? (
                <div className="text-sm text-muted-foreground">Kayıt yok</div>
              ) : (
                <div className="space-y-2">
                  {recentBackups.map((it) => (
                    <div key={`rb-${it.deviceId}`} className="flex items-center gap-2">
                      <div className="flex-1 truncate">{it.name}</div>
                      <div className={cn("text-xs rounded px-2 py-1", it.lastSuccess ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}>{it.lastSuccess ? "Başarılı" : "Hatalı"}</div>
                      <div className="text-xs text-muted-foreground">{it.lastTs ? new Date(it.lastTs).toLocaleString() : "-"}</div>
                      <Button size="sm" variant="outline" asChild><Link href={`/backups/${it.deviceId}`}>Yedekler</Link></Button>
                      <Button size="sm" variant="outline" asChild><Link href={`/devices/${it.deviceId}/status`}>Durum</Link></Button>
                    </div>
                  ))}
                </div>
              )}
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
