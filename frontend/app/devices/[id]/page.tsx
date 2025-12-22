"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../../components/ui/select";
import { Input } from "../../../components/ui/input";
import { Badge } from "../../../components/ui/badge";
import { AppShell } from "../../../components/layout/app-shell";
import { apiFetch, logout, getToken, cn } from "../../../lib/utils";
import { vendorToneClasses, vendorIcon } from "../../../lib/vendor";
import { Progress } from "../../../components/ui/progress";

type Device = { id: string; name: string; hostname: string | null; mgmt_ip: string | null; ssh_port: number; vendor: string; is_active: boolean };
type Inventory = { model: string | null; firmware: string | null; serial: string | null };
type ExecutionItem = { id: string; status: string; started_at: string; completed_at: string | null; error_message: string | null; backup_id: string | null };
type BackupItem = { id: string; job_id: string | null; backup_timestamp: string; config_size_bytes: number; is_success: boolean; error_message: string | null };
type IfItem = { index: number; name: string; adminStatus: number | null; operStatus: number | null };
type StatusItem = { uptimeTicks: number | null; cpuPercent: number | null; memUsedPercent: number | null };

function st(n: number | null): string {
  if (n === 1) return "Açık";
  if (n === 2) return "Kapalı";
  if (n === 3) return "Test";
  return "-";
}

export default function DeviceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [device, setDevice] = useState<Device | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [executions, setExecutions] = useState<ExecutionItem[]>([]);
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [interfaces, setInterfaces] = useState<IfItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [eLimit, setELimit] = useState(10);
  const [eOffset, setEOffset] = useState(0);
  const [eStatus, setEStatus] = useState<string>("all");
  const [eQuery, setEQuery] = useState("");

  const [bLimit, setBLimit] = useState(10);
  const [bOffset, setBOffset] = useState(0);
  const [bSuccessOnly, setBSuccessOnly] = useState(false);
  const [bQuery, setBQuery] = useState("");

  const [onlyDown, setOnlyDown] = useState(false);

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshMs, setRefreshMs] = useState(30000);
  const [status, setStatus] = useState<StatusItem | null>(null);

  async function loadDevice() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/devices/${params.id}`);
      if (!res.ok) { if (res.status === 401) { logout(); return; } setError("Cihaz alınamadı"); return; }
      const j = await res.json();
      const d = j.item;
      setDevice({ id: d.id, name: d.name, hostname: d.hostname ?? null, mgmt_ip: d.mgmt_ip ?? null, ssh_port: d.ssh_port, vendor: d.vendor, is_active: !!d.is_active });
    } catch { setError("Ağ hatası"); }
  }

  async function loadInventory() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/monitoring/devices/${params.id}/inventory`);
      if (!res.ok) { if (res.status === 401) { logout(); return; } return; }
      const j = await res.json();
      setInventory({ model: j.model ?? null, firmware: j.firmware ?? null, serial: j.serial ?? null });
    } catch {}
  }

  async function loadExecutions() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const q = new URLSearchParams();
      q.set("limit", String(eLimit));
      q.set("offset", String(eOffset));
      if (eStatus && eStatus !== "all") q.set("status", eStatus);
      const res = await apiFetch(`/executions/${params.id}?${q.toString()}`);
      if (!res.ok) { if (res.status === 401) { logout(); return; } return; }
      const j = await res.json();
      setExecutions(Array.isArray(j.items) ? j.items : []);
    } catch {}
  }

  async function loadBackups() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const q = new URLSearchParams();
      q.set("limit", String(bLimit));
      q.set("offset", String(bOffset));
      if (bSuccessOnly) q.set("success", "true");
      const res = await apiFetch(`/backups/${params.id}?${q.toString()}`);
      if (!res.ok) { if (res.status === 401) { logout(); return; } return; }
      const j = await res.json();
      setBackups(Array.isArray(j.items) ? j.items : []);
    } catch {}
  }

  async function loadInterfaces() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/monitoring/devices/${params.id}/interfaces`);
      if (!res.ok) { if (res.status === 401) { logout(); return; } return; }
      const j = await res.json();
      setInterfaces(Array.isArray(j.items) ? j.items : []);
    } catch {}
  }

  async function loadStatus() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/monitoring/devices/${params.id}/status`);
      if (!res.ok) { if (res.status === 401) { logout(); return; } return; }
      const j = await res.json();
      setStatus({ uptimeTicks: j.uptimeTicks ?? null, cpuPercent: j.cpuPercent ?? null, memUsedPercent: j.memUsedPercent ?? null });
    } catch {}
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
      if (!res.ok) { if (res.status === 401) { logout(); return; } alert("Geri yükleme başlatılamadı"); return; }
      const j = await res.json();
      alert(`Geri yükleme isteği oluşturuldu: ${j.executionId}`);
      loadExecutions();
    } catch {
      alert("Ağ hatası");
    }
  }

  useEffect(() => { setLoading(true); Promise.all([loadDevice(), loadInventory(), loadExecutions(), loadBackups(), loadInterfaces(), loadStatus()]).finally(() => setLoading(false)); }, []);
  useEffect(() => { loadExecutions(); }, [eLimit, eOffset, eStatus]);
  useEffect(() => { loadBackups(); }, [bLimit, bOffset, bSuccessOnly]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => { loadExecutions(); loadBackups(); loadInterfaces(); loadStatus(); }, refreshMs);
    return () => clearInterval(t);
  }, [autoRefresh, refreshMs, eLimit, eOffset, eStatus, bLimit, bOffset, bSuccessOnly]);

  const execsView = useMemo(() => executions.filter((e) => {
    const t = eQuery.trim().toLowerCase();
    if (!t) return true;
    const strs = [e.status, e.error_message || "", e.started_at, e.completed_at || ""]; 
    return strs.some((s) => s.toLowerCase().includes(t));
  }), [executions, eQuery]);

  const backupsView = useMemo(() => backups.filter((b) => {
    const t = bQuery.trim().toLowerCase();
    if (!t) return true;
    const strs = [String(b.config_size_bytes), b.error_message || "", b.backup_timestamp, b.is_success ? "başarılı" : "hatalı"]; 
    return strs.some((s) => s.toLowerCase().includes(t));
  }), [backups, bQuery]);

  const ifView = useMemo(() => (onlyDown ? interfaces.filter((x) => x.operStatus === 2) : interfaces), [interfaces, onlyDown]);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold">Cihaz Detayı</h2>
          {device && (
            <Badge className={cn("gap-1", vendorToneClasses(device.vendor))}>
              {vendorIcon(device.vendor)}
              <span>{device.vendor}</span>
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/devices">Cihazlar</Link></Button>
          {device && <Button asChild variant="outline"><Link href={`/devices/${device.id}/status`}>Durum</Link></Button>}
          {device && <Button asChild variant="outline"><Link href={`/devices/${device.id}/inventory`}>Envanter</Link></Button>}
          {device && <Button asChild variant="outline"><Link href={`/backups/${device.id}`}>Yedekler</Link></Button>}
        </div>
      </div>

      {error && <p className="text-sm text-destructive mb-2">{error}</p>}

      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Cihaz Bilgileri</CardTitle>
          </CardHeader>
          <CardContent>
            {!device ? (
              <div className="text-sm text-muted-foreground">Yükleniyor...</div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border p-3"><div className="text-sm text-muted-foreground">Ad</div><div className="font-medium">{device.name}</div></div>
                <div className="rounded-md border p-3"><div className="text-sm text-muted-foreground">Hostname</div><div className="font-medium">{device.hostname || "-"}</div></div>
                <div className="rounded-md border p-3"><div className="text-sm text-muted-foreground">IP</div><div className="font-medium">{device.mgmt_ip || "-"}</div></div>
                <div className="rounded-md border p-3"><div className="text-sm text-muted-foreground">SSH Port</div><div className="font-medium">{device.ssh_port}</div></div>
                <div className="rounded-md border p-3"><div className="text-sm text-muted-foreground">Aktif</div><div className="font-medium">{device.is_active ? "Evet" : "Hayır"}</div></div>
                {inventory && <div className="rounded-md border p-3"><div className="text-sm text-muted-foreground">Model</div><div className="font-medium">{inventory.model || "-"}</div></div>}
                {inventory && <div className="rounded-md border p-3"><div className="text-sm text-muted-foreground">Yazılım</div><div className="font-medium">{inventory.firmware || "-"}</div></div>}
                {inventory && <div className="rounded-md border p-3"><div className="text-sm text-muted-foreground">Seri No</div><div className="font-medium">{inventory.serial || "-"}</div></div>}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Otomatik Yenile</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} /><span>Aktif</span></label>
              <div className="w-48">
                <Select value={String(refreshMs)} onValueChange={(v) => setRefreshMs(Number(v))}>
                  <SelectTrigger><SelectValue placeholder="Süre" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15000">15 sn</SelectItem>
                    <SelectItem value="30000">30 sn</SelectItem>
                    <SelectItem value="60000">60 sn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={() => { loadExecutions(); loadBackups(); loadInterfaces(); }}>Yenile</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Mini Durum</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">CPU</div>
              <div className="flex items-center gap-2">
                <div className="flex-1"><Progress value={status?.cpuPercent ?? 0} /></div>
                <div className="w-16 text-right font-medium">{status?.cpuPercent !== null ? `${status?.cpuPercent}%` : "-"}</div>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Bellek</div>
              <div className="flex items-center gap-2">
                <div className="flex-1"><Progress value={status?.memUsedPercent ?? 0} /></div>
                <div className="w-16 text-right font-medium">{status?.memUsedPercent !== null ? `${status?.memUsedPercent}%` : "-"}</div>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-sm text-muted-foreground">Uptime</div>
              <div className="font-medium">{(() => { const t = status?.uptimeTicks ?? null; if (t === null) return "-"; const h = Math.floor(t / (100 * 3600)); return `${h} saat`; })()}</div>
            </div>
          </div>
          <div className="mt-3">
            <Button variant="outline" onClick={loadStatus}>Durumu Yenile</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Değişiklik Geçmişi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <div className="w-64">
              <Select value={eStatus} onValueChange={(v) => { setEStatus(v); setEOffset(0); }}>
                <SelectTrigger><SelectValue placeholder="Durum" /></SelectTrigger>
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
            <Input className="w-64" placeholder="Ara" value={eQuery} onChange={(e) => setEQuery(e.target.value)} />
            <Button variant="outline" onClick={() => { const n = Math.max(0, eOffset - eLimit); setEOffset(n); }}>Önceki</Button>
            <Button variant="outline" onClick={() => { const n = eOffset + eLimit; setEOffset(n); }}>Sonraki</Button>
          </div>
          <ul className="space-y-2">
            {execsView.map((e) => (
              <li key={e.id} className="rounded-md border p-3">
                <div className="grid md:grid-cols-4 gap-2 items-center">
                  <div className="font-medium">{new Date(e.started_at).toLocaleString()}</div>
                  <div className="text-muted-foreground">{e.status}</div>
                  <div className="text-muted-foreground">{e.completed_at ? new Date(e.completed_at).toLocaleString() : "-"}</div>
                  <div className="text-sm text-destructive truncate">{e.error_message || ""}</div>
                </div>
              </li>
            ))}
            {execsView.length === 0 && <li className="text-sm text-muted-foreground">Kayıt yok</li>}
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Backup Listesi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2 mb-3">
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={bSuccessOnly} onChange={(e) => { setBSuccessOnly(e.target.checked); setBOffset(0); }} /><span>Sadece başarılı</span></label>
            <Input className="w-64" placeholder="Ara" value={bQuery} onChange={(e) => setBQuery(e.target.value)} />
            <Button variant="outline" onClick={() => { const n = Math.max(0, bOffset - bLimit); setBOffset(n); }}>Önceki</Button>
            <Button variant="outline" onClick={() => { const n = bOffset + bLimit; setBOffset(n); }}>Sonraki</Button>
            {device && <Button asChild variant="outline"><Link href={`/backups/${device.id}/diff`}>Son iki yedek diff</Link></Button>}
          </div>
          <ul className="space-y-2">
            {backupsView.map((b) => (
              <li key={b.id} className="rounded-md border p-3">
                <div className="grid md:grid-cols-5 gap-2 items-center">
                  <div className="font-medium">{new Date(b.backup_timestamp).toLocaleString()}</div>
                  <div className={b.is_success ? "text-green-600" : "text-red-600"}>{b.is_success ? "Başarılı" : "Hatalı"}</div>
                  <div className="text-muted-foreground">{b.config_size_bytes} bayt</div>
                  <div className="text-sm text-destructive truncate">{b.error_message || ""}</div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button size="sm" variant="outline" onClick={() => downloadBackup(b.id)}>İndir</Button>
                    <Button size="sm" onClick={() => restoreBackup(b.id)}>Geri Yükle</Button>
                  </div>
                </div>
              </li>
            ))}
            {backupsView.length === 0 && <li className="text-sm text-muted-foreground">Kayıt yok</li>}
          </ul>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Port Bilgileri</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={onlyDown} onChange={(e) => setOnlyDown(e.target.checked)} /><span>Sadece düşen</span></label>
            <Button variant="outline" onClick={loadInterfaces}>Yenile</Button>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Yükleniyor...</div>
          ) : ifView.length === 0 ? (
            <div className="text-sm text-muted-foreground">Veri yok</div>
          ) : (
            <div className="grid gap-2">
              {ifView.map((it) => (
                <div key={it.index} className="grid grid-cols-2 md:grid-cols-4 items-center gap-2 rounded-md border p-2">
                  <div className="font-medium truncate">{it.name || it.index}</div>
                  <div className="text-sm text-muted-foreground">Index: {it.index}</div>
                  <div className="text-sm">Admin: {st(it.adminStatus)}</div>
                  <div className="text-sm">Operasyonel: {st(it.operStatus)}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
