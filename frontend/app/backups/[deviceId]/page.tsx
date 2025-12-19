"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../../components/ui/select";
import { apiFetch, logout, getToken } from "../../../lib/utils";
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

export default function BackupsPage() {
  const params = useParams<{ deviceId: string }>();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [error, setError] = useState("");
  
  const [bLimit, setBLimit] = useState(10);
  const [bOffset, setBOffset] = useState(0);
  const [bSuccessOnly, setBSuccessOnly] = useState(false);
  const [eLimit, setELimit] = useState(10);
  const [eOffset, setEOffset] = useState(0);
  const [eStatus, setEStatus] = useState<string>("all");

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
      const [bRes, eRes] = await Promise.all([
        apiFetch(`/backups/${params.deviceId}?${bParams.toString()}`),
        apiFetch(`/executions/${params.deviceId}?${eParams.toString()}`),
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
    } catch {
      setError("Ağ hatası");
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Yedek Geçmişi</h2>
        <Button asChild>
          <Link href={`/backups/${params.deviceId}/diff`}>Son iki yedek diff</Link>
        </Button>
      </div>
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Backups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={bSuccessOnly} onChange={(e) => { setBSuccessOnly(e.target.checked); setBOffset(0); }} className="h-4 w-4" />
              <span>Sadece başarılı</span>
            </label>
            <Button variant="outline" onClick={() => { setBOffset(Math.max(0, bOffset - bLimit)); load(); }}>Önceki</Button>
            <Button variant="outline" onClick={() => { setBOffset(bOffset + bLimit); load(); }}>Sonraki</Button>
            <Button onClick={() => { setBOffset(0); setEOffset(0); load(); }}>Yenile</Button>
          </div>
          <ul className="space-y-2">
            {backups.map((b) => (
              <li key={b.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{new Date(b.backup_timestamp).toLocaleString()}</span>
                  <span className={b.is_success ? "text-green-600" : "text-red-600"}>{b.is_success ? "Başarılı" : "Hatalı"}</span>
                  <span className="text-muted-foreground">{b.config_size_bytes} bayt</span>
                  {b.error_message && <span className="text-destructive">{b.error_message}</span>}
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
              <Select value={eStatus} onValueChange={(v) => { setEStatus(v); setEOffset(0); }}>
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
            <Button variant="outline" onClick={() => { setEOffset(Math.max(0, eOffset - eLimit)); load(); }}>Önceki</Button>
            <Button variant="outline" onClick={() => { setEOffset(eOffset + eLimit); load(); }}>Sonraki</Button>
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
