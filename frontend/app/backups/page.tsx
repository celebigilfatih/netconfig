"use client";
import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { apiFetch, logout, getToken } from "../../lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import { AppShell } from "../../components/layout/app-shell";

type Device = {
  id: string;
  name: string;
  vendor: string;
  is_active: boolean;
};

function BackupsContent() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [lasts, setLasts] = useState<Record<string, { ts: string; ok: boolean; err: string | null }>>({});
  const [counts24h, setCounts24h] = useState<Record<string, { success: number; failed: number }>>({});
  const [counts7d, setCounts7d] = useState<Record<string, { success: number; failed: number }>>({});
  const [counts30d, setCounts30d] = useState<Record<string, { success: number; failed: number }>>({});
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  function applyQueryToUrl(r?: "24h" | "7d" | "30d") {
    const params = new URLSearchParams();
    params.set("range", r ?? range);
    if (issuesOnly) params.set("issuesOnly", "true");
    router.replace(`/backups?${params.toString()}`, { scroll: false });
  }

  async function load() {
    setError("");
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/stats/backup_overview_by_device`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Veri alınamadı");
        return;
      }
      const data = await res.json();
      const devs: Device[] = (data.items || []).map((it: any) => ({ id: it.deviceId as string, name: it.name as string, vendor: it.vendor as string, is_active: true }));
      setDevices(devs);
      const lm: Record<string, { ts: string; ok: boolean; err: string | null }> = {};
      const c24: Record<string, { success: number; failed: number }> = {};
      const c7: Record<string, { success: number; failed: number }> = {};
      const c30: Record<string, { success: number; failed: number }> = {};
      for (const it of data.items || []) {
        if (it.lastTs) lm[it.deviceId as string] = { ts: it.lastTs as string, ok: !!it.lastSuccess, err: (it.lastError as string) ?? null };
        if (it.counts24h) c24[it.deviceId as string] = { success: it.counts24h.success as number, failed: it.counts24h.failed as number };
        if (it.counts7d) c7[it.deviceId as string] = { success: it.counts7d.success as number, failed: it.counts7d.failed as number };
        if (it.counts30d) c30[it.deviceId as string] = { success: it.counts30d.success as number, failed: it.counts30d.failed as number };
      }
      setLasts(lm);
      setCounts24h(c24);
      setCounts7d(c7);
      setCounts30d(c30);
    } catch {
      setError("Ağ hatası");
    }
  }

  async function loadCounts(rng?: "24h" | "7d" | "30d") {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const key = rng ?? range;
      const endpoint = key === "24h" ? "/stats/backup_counts_by_device_24h" : key === "7d" ? "/stats/backup_counts_by_device_7d" : "/stats/backup_counts_by_device_30d";
      const r = await apiFetch(endpoint);
      if (!r.ok) return;
      const j = await r.json();
      const obj: Record<string, { success: number; failed: number }> = {};
      for (const it of j.items || []) obj[it.deviceId as string] = { success: it.success as number, failed: it.failed as number };
      if (key === "24h") setCounts24h(obj);
      if (key === "7d") setCounts7d(obj);
      if (key === "30d") setCounts30d(obj);
    } catch {}
  }

  useEffect(() => {
    const r = searchParams.get("range");
    const io = searchParams.get("issuesOnly");
    if (r === "24h" || r === "7d" || r === "30d") setRange(r);
    if (io === "true") setIssuesOnly(true);
    setTimeout(() => { load(); loadCounts(r as any); }, 0);
  }, []);

  useEffect(() => {
    applyQueryToUrl();
    loadCounts(range);
  }, [range]);

  useEffect(() => {
    applyQueryToUrl();
  }, [issuesOnly]);

  return (
    <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Yedekler</h2>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Card>
          <CardHeader>
            <CardTitle>Cihaz Bazlı Yedekler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-sm text-muted-foreground">Aralık:</span>
              <Button size="sm" variant={range === "24h" ? "default" : "outline"} onClick={() => { setRange("24h"); }}>24s</Button>
              <Button size="sm" variant={range === "7d" ? "default" : "outline"} onClick={() => { setRange("7d"); }}>7g</Button>
              <Button size="sm" variant={range === "30d" ? "default" : "outline"} onClick={() => { setRange("30d"); }}>30g</Button>
              <label className="ml-auto flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={issuesOnly} onChange={(e) => setIssuesOnly(e.target.checked)} />
                <span className="text-sm">Yalnızca sorunlu</span>
              </label>
            </div>
            <ul className="space-y-2">
              {[...devices]
                .filter((d) => {
                  if (!issuesOnly) return true;
                  const key = range === "24h" ? counts24h : range === "7d" ? counts7d : counts30d;
                  const c = key[d.id];
                  return c ? c.failed > 0 : false;
                })
                .sort((a, b) => {
                const la = lasts[a.id];
                const lb = lasts[b.id];
                const aErr = la ? !la.ok : false;
                const bErr = lb ? !lb.ok : false;
                if (aErr !== bErr) return aErr ? -1 : 1;
                const ta = la ? new Date(la.ts).getTime() : 0;
                const tb = lb ? new Date(lb.ts).getTime() : 0;
                return tb - ta;
              }).map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                  <span className="font-medium">{d.name} <span className="text-muted-foreground">({d.vendor})</span></span>
                  {lasts[d.id] && (
                    <span className={lasts[d.id].ok ? "text-green-600" : "text-red-600"}>
                      Son yedek: {new Date(lasts[d.id].ts).toLocaleString()} ({lasts[d.id].ok ? "Başarılı" : "Hatalı"})
                    </span>
                  )}
                  {lasts[d.id] && lasts[d.id].err && (
                    <span className="inline-flex items-center rounded-md bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium" title={lasts[d.id].err || ""}>Hata</span>
                  )}
                  {counts24h[d.id] && (
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">{counts24h[d.id].success} başarılı</span>
                      <span className="inline-flex items-center rounded-md bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">{counts24h[d.id].failed} hatalı</span>
                    </span>
                  )}
                  {counts7d[d.id] && (
                    <span className="inline-flex items-center gap-1 text-xs">
                      {(() => {
                        const s24 = counts24h[d.id];
                        const s7 = counts7d[d.id];
                        const r24 = s24 ? (s24.success + s24.failed > 0 ? s24.success / (s24.success + s24.failed) : 0) : 0;
                        const r7 = s7 ? (s7.success + s7.failed > 0 ? s7.success / (s7.success + s7.failed) : 0) : 0;
                        if (r24 > r7) return <span className="inline-flex items-center text-green-700"><TrendingUp className="h-3 w-3" /> Başarı oranı (24s vs 7g)</span>;
                        if (r24 < r7) return <span className="inline-flex items-center text-red-700"><TrendingDown className="h-3 w-3" /> Başarı oranı (24s vs 7g)</span>;
                        return <span className="text-muted-foreground">Başarı oranı (24s vs 7g)</span>;
                      })()}
                    </span>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/backups/${d.id}`}>Geçmiş</Link>
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/backups/${d.id}/diff`}>Son iki diff</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
  );
}

export default function BackupsOverviewPage() {
  return (
    <AppShell>
      <Suspense fallback={<div />}>
        <BackupsContent />
      </Suspense>
    </AppShell>
  );
}
