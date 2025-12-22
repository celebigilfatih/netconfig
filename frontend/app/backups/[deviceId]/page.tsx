"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../../components/ui/select";
import { apiFetch, logout, getToken } from "../../../lib/utils";
import { Progress } from "../../../components/ui/progress";
import { AppShell } from "../../../components/layout/app-shell";

type BackupItem = {
  id: string;
  job_id: string | null;
  backup_timestamp: string;
  config_size_bytes: number;
  is_success: boolean;
  error_message: string | null;
};

type ExecutionItem = {
  id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  backup_id: string | null;
};

type StatusItem = { uptimeTicks: number | null; cpuPercent: number | null; memUsedPercent: number | null };

export default function BackupsPage() {
  const params = useParams<{ deviceId: string }>();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<StatusItem | null>(null);
  
  const [bLimit, setBLimit] = useState(10);
  const [bOffset, setBOffset] = useState(0);
  const [bSuccessOnly, setBSuccessOnly] = useState(false);
  const [eLimit, setELimit] = useState(10);
  const [eOffset, setEOffset] = useState(0);
  const [eStatus, setEStatus] = useState<string>("all");
  const searchParams = useSearchParams();
  const router = useRouter();

  function applyQueryToUrl(bo?: number, eo?: number) {
    const paramsQS = new URLSearchParams();
    paramsQS.set("bLimit", String(bLimit));
    paramsQS.set("bOffset", String(bo ?? bOffset));
    if (bSuccessOnly) paramsQS.set("bSuccessOnly", "true");
    paramsQS.set("eLimit", String(eLimit));
    paramsQS.set("eOffset", String(eo ?? eOffset));
    if (eStatus && eStatus !== "all") paramsQS.set("eStatus", eStatus);
    router.replace(`/backups/${params.deviceId}?${paramsQS.toString()}`, { scroll: false });
  }

  async function load() {
    setError("");
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const bParams = new URLSearchParams();
      bParams.set("limit", String(bLimit));
      bParams.set("offset", String(bOffset));
      if (bSuccessOnly) bParams.set("success", "true");
      const eParams = new URLSearchParams();
      eParams.set("limit", String(eLimit));
      eParams.set("offset", String(eOffset));
      if (eStatus && eStatus !== "all") eParams.set("status", eStatus);
      const [bRes, eRes, sRes] = await Promise.all([
        apiFetch(`/backups/${params.deviceId}?${bParams.toString()}`),
        apiFetch(`/executions/${params.deviceId}?${eParams.toString()}`),
        apiFetch(`/monitoring/devices/${params.deviceId}/status`),
      ]);
      if (!bRes.ok || !eRes.ok) {
        if (bRes.status === 401 || eRes.status === 401) { logout(); return; }
        setError("Veri alınamadı");
        return;
      }
      const bData = await bRes.json();
      const eData = await eRes.json();
      setBackups(bData.items || []);
      setExecutions(eData.items || []);
      if (sRes.ok) {
        const j = await sRes.json();
        setStatus({ uptimeTicks: j.uptimeTicks ?? null, cpuPercent: j.cpuPercent ?? null, memUsedPercent: j.memUsedPercent ?? null });
      }
    } catch {
      setError("Ağ hatası");
    }
  }

  async function downloadBackup(id: string) {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/backups/${id}/download`);
      if (!res.ok) { if (res.status === 401) { logout(); return; } alert("İndirilemedi"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_${id}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Ağ hatası");
    }
  }

  async function restoreBackup(id: string) {
    if (!confirm("Bu yedeği geri yüklemek istediğinize emin misiniz?")) return;
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/backups/${id}/restore`, { method: "POST" });
      if (!res.ok) { if (res.status === 401) { logout(); return; } const j = await res.json().catch(() => ({})); alert(j.message || "Geri yükleme başlatılamadı"); return; }
      const j = await res.json();
      alert(`Geri yükleme isteği oluşturuldu: ${j.executionId}`);
      load();
    } catch {
      alert("Ağ hatası");
    }
  }

  useEffect(() => {
    const bl = searchParams.get("bLimit");
    const bo = searchParams.get("bOffset");
    const bs = searchParams.get("bSuccessOnly");
    const el = searchParams.get("eLimit");
    const eo = searchParams.get("eOffset");
    const es = searchParams.get("eStatus");
    if (bl && !Number.isNaN(Number(bl))) setBLimit(Number(bl));
    if (bo && !Number.isNaN(Number(bo))) setBOffset(Number(bo));
    if (bs === "true") setBSuccessOnly(true);
    if (el && !Number.isNaN(Number(el))) setELimit(Number(el));
    if (eo && !Number.isNaN(Number(eo))) setEOffset(Number(eo));
    if (es) setEStatus(es);
    setTimeout(() => { load(); }, 0);
  }, []);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Yedek Geçmişi</h2>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/backups/${params.deviceId}/manual`}>Manuel yedek</Link>
          </Button>
          <Button asChild>
            <Link href={`/backups/${params.deviceId}/diff`}>Son iki yedek diff</Link>
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <Card>
          <CardHeader>
            <CardTitle>CPU</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="w-48">
                <Progress value={typeof status?.cpuPercent === "number" ? status!.cpuPercent! : 0} />
              </div>
              <span className="text-muted-foreground">{typeof status?.cpuPercent === "number" ? `${status!.cpuPercent!}%` : "-"}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bellek</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="w-48">
                <Progress value={typeof status?.memUsedPercent === "number" ? status!.memUsedPercent! : 0} />
              </div>
              <span className="text-muted-foreground">{typeof status?.memUsedPercent === "number" ? `${status!.memUsedPercent!}%` : "-"}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Uptime</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-muted-foreground">{typeof status?.uptimeTicks === "number" ? `${Math.floor((status!.uptimeTicks!)/ (100 * 3600))} saat` : "-"}</span>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Backups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={bSuccessOnly} onChange={(e) => { setBSuccessOnly(e.target.checked); setBOffset(0); setTimeout(() => { applyQueryToUrl(0, undefined); load(); }, 0); }} className="h-4 w-4" />
              <span>Sadece başarılı</span>
            </label>
            <Button variant="outline" onClick={() => { const next = Math.max(0, bOffset - bLimit); setBOffset(next); applyQueryToUrl(next, undefined); load(); }}>Önceki</Button>
            <Button variant="outline" onClick={() => { const next = bOffset + bLimit; setBOffset(next); applyQueryToUrl(next, undefined); load(); }}>Sonraki</Button>
            <Button onClick={() => { setBOffset(0); setEOffset(0); applyQueryToUrl(0, 0); load(); }}>Yenile</Button>
          </div>
          <ul className="space-y-2">
            {backups.map((b) => (
              <li key={b.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{new Date(b.backup_timestamp).toLocaleString()}</span>
                  <span className={b.is_success ? "text-green-600" : "text-red-600"}>{b.is_success ? "Başarılı" : "Hatalı"}</span>
                  <span className="text-muted-foreground">{b.config_size_bytes} bayt</span>
                  {b.error_message && <span className="text-destructive">{b.error_message}</span>}
                  <span className="flex-1" />
                  <Button variant="outline" onClick={() => downloadBackup(b.id)}>İndir</Button>
                  <Button onClick={() => restoreBackup(b.id)}>Geri Yükle</Button>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Executions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <div className="w-64">
              <Select value={eStatus} onValueChange={(v) => { setEStatus(v); setEOffset(0); setTimeout(() => { applyQueryToUrl(undefined, 0); load(); }, 0); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Durum (tümü)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Durum (tümü)</SelectItem>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="running">running</SelectItem>
                  <SelectItem value="success">success</SelectItem>
                  <SelectItem value="failed">failed</SelectItem>
                  <SelectItem value="skipped">skipped</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => { const next = Math.max(0, eOffset - eLimit); setEOffset(next); applyQueryToUrl(undefined, next); load(); }}>Önceki</Button>
            <Button variant="outline" onClick={() => { const next = eOffset + eLimit; setEOffset(next); applyQueryToUrl(undefined, next); load(); }}>Sonraki</Button>
          </div>
          <ul className="space-y-2">
            {executions.map((e) => (
              <li key={e.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{new Date(e.started_at).toLocaleString()}</span>
                  <span className="text-muted-foreground">{e.status}</span>
                  {e.completed_at && (
                    <span className="text-muted-foreground">tamamlandı: {new Date(e.completed_at).toLocaleString()}</span>
                  )}
                  {e.error_message && <span className="text-destructive">{e.error_message}</span>}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </AppShell>
  );
}
