"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../../../components/ui/select";
import { AppShell } from "../../../../components/layout/app-shell";
import { apiFetch, logout, getToken, cn } from "../../../../lib/utils";
import { Badge } from "../../../../components/ui/badge";
import { Progress } from "../../../../components/ui/progress";
import { vendorToneClasses, vendorIcon } from "../../../../lib/vendor";

type HistoryItem = { ts: string; uptimeTicks: number | null; cpuPercent: number | null; memUsedPercent: number | null };
type Device = { id: string; name: string; vendor: string };

function Sparkline({ values, width = 240, height = 60, color = "#0ea5e9" }: { values: number[]; width?: number; height?: number; color?: string }) {
  const vals = values.length ? values : [0];
  const n = vals.length;
  const pts = vals.map((v, i) => {
    const x = n > 1 ? (i / (n - 1)) * width : width;
    const y = height - (Math.max(0, Math.min(100, Math.round(v))) / 100) * height;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}> 
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatUptime(ticks: number | null): string {
  if (!ticks || ticks <= 0) return "-";
  const seconds = Math.floor(ticks / 100);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}g ${h}s ${m}d` : h ? `${h}s ${m}d` : `${m}d`;
}

export default function DeviceStatusPage() {
  const params = useParams<{ id: string }>();
  const [device, setDevice] = useState<Device | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState("");
  const [range, setRange] = useState("24h");
  const [points, setPoints] = useState(50);
  const [loading, setLoading] = useState(true);
  const [measuring, setMeasuring] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshMs, setRefreshMs] = useState(30000);

  async function loadDevice() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/devices/${params.id}`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Cihaz alınamadı");
        return;
      }
      const j = await res.json();
      const d = j.item;
      setDevice({ id: d.id as string, name: d.name as string, vendor: d.vendor as string });
    } catch {
      setError("Ağ hatası");
    }
  }

  async function loadHistory() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/monitoring/devices/${params.id}/status_history?range=${range}&points=${points}`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Geçmiş alınamadı");
        return;
      }
      const j = await res.json();
      setHistory(Array.isArray(j.items) ? j.items : []);
    } catch {
      setError("Ağ hatası");
    } finally {
      setLoading(false);
    }
  }

  async function measureNow() {
    try {
      setMeasuring(true);
      const res = await apiFetch(`/monitoring/devices/${params.id}/status?persist=true`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
      }
      await loadHistory();
    } finally {
      setMeasuring(false);
    }
  }

  useEffect(() => { setLoading(true); loadDevice(); loadHistory(); }, []);
  useEffect(() => { setLoading(true); loadHistory(); }, [range, points]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => { loadHistory(); }, refreshMs);
    return () => clearInterval(t);
  }, [autoRefresh, refreshMs, range, points]);

  const cpuVals = useMemo(() => history.map((h) => h.cpuPercent ?? 0), [history]);
  const memVals = useMemo(() => history.map((h) => h.memUsedPercent ?? 0), [history]);
  const last = history.length ? history[history.length - 1] : null;

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold">Cihaz Durumu</h2>
          {device && (
            <Badge className={cn("gap-1", vendorToneClasses(device.vendor))}>
              {vendorIcon(device.vendor)}
              <span>{device.vendor}</span>
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/devices">Cihazlar</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/devices/${params.id}/interfaces`}>Arayüzler</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/devices/${params.id}/inventory`}>Envanter</Link>
          </Button>
          <Button onClick={measureNow} disabled={measuring}>Şimdi Ölç</Button>
        </div>
      </div>

      {device && (
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground">{device.name}</div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Geçmiş</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="w-40">
              <Select value={range} onValueChange={(v) => setRange(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Aralık" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 saat</SelectItem>
                  <SelectItem value="6h">6 saat</SelectItem>
                  <SelectItem value="24h">24 saat</SelectItem>
                  <SelectItem value="7d">7 gün</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <Select value={String(points)} onValueChange={(v) => setPoints(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Puan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
              <span>Oto Yenile</span>
            </label>
            <div className="w-40">
              <Select value={String(refreshMs)} onValueChange={(v) => setRefreshMs(Number(v))}>
                <SelectTrigger>
                  <SelectValue placeholder="Süre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15000">15 sn</SelectItem>
                  <SelectItem value="30000">30 sn</SelectItem>
                  <SelectItem value="60000">60 sn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={loadHistory}>Yenile</Button>
          </div>
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          {loading ? (
            <div className="text-sm text-muted-foreground">Yükleniyor...</div>
          ) : history.length === 0 ? (
            <div className="text-sm text-muted-foreground">Veri yok</div>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">CPU</div>
                  <div className="text-sm text-muted-foreground">{last?.cpuPercent ?? "-"}%</div>
                </div>
                {typeof (last?.cpuPercent ?? null) === "number" && <Progress value={last!.cpuPercent!} />}
                <div className="mt-3">
                  <Sparkline values={cpuVals} color="#ef4444" />
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Bellek</div>
                  <div className="text-sm text-muted-foreground">{last?.memUsedPercent ?? "-"}%</div>
                </div>
                {typeof (last?.memUsedPercent ?? null) === "number" && <Progress value={last!.memUsedPercent!} />}
                <div className="mt-3">
                  <Sparkline values={memVals} color="#0ea5e9" />
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Çalışma Süresi</div>
                  <div className="text-sm text-muted-foreground">{formatUptime(last?.uptimeTicks ?? null)}</div>
                </div>
                <div className="text-sm text-muted-foreground">Son: {last ? new Date(last.ts).toLocaleString() : "-"}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
