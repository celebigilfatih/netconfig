"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Progress } from "../../components/ui/progress";
import { Donut } from "../../components/charts/donut";
import { apiFetch, logout, getToken } from "../../lib/utils";
import { AppShell } from "../../components/layout/app-shell";

type Device = {
  id: string;
  name: string;
  vendor: string;
  is_active: boolean;
};

export default function DashboardPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [statsExtra, setStatsExtra] = useState<{ backups24h?: { success: number; failed: number }; pendingExecutions?: number; lastBackupTs?: string | null }>({});

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
    } catch {
      setError("Ağ hatası");
    }
  }

  useEffect(() => { load(); }, []);

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

  return (
    <AppShell>
      
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
          <Button size="sm" variant="outline" asChild>
            <Link href="/devices">Tümü</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/devices?isActive=true">Aktif</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/devices?vendor=fortigate">FortiGate</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/devices?vendor=cisco_ios">Cisco IOS</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/devices?vendor=mikrotik">MikroTik</Link>
          </Button>
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
          <Card>
            <CardHeader>
              <CardTitle>Vendor Kartları</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" asChild><Link href="/devices?vendor=fortigate">FortiGate</Link></Button>
                <Button variant="outline" asChild><Link href="/devices?vendor=cisco_ios">Cisco IOS</Link></Button>
                <Button variant="outline" asChild><Link href="/devices?vendor=mikrotik">MikroTik</Link></Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Aylık Aktivite</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative h-40 w-full overflow-hidden rounded-md bg-muted">
                <svg viewBox="0 0 500 160" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
                  <path d="M0,80 C120,20 200,140 320,60 C400,20 500,120 500,120 L500,160 L0,160 Z" fill="currentColor" className="text-primary/20" />
                </svg>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Öne Çıkan Cihazlar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {devices.slice(0,6).map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{backgroundColor: d.vendor === "fortigate" ? "#22c55e" : d.vendor === "cisco_ios" ? "#3b82f6" : "#f59e0b"}} />
                    <span className="flex-1">{d.name}</span>
                    <Button size="sm" variant="outline" asChild><Link href={`/backups/${d.id}`}>Geçmiş</Link></Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
