"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "../../../../components/layout/app-shell";
import { Card, CardHeader, CardTitle, CardContent } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { apiFetch, logout, getToken } from "../../../../lib/utils";
import { Progress } from "../../../../components/ui/progress";
import { Input } from "../../../../components/ui/input";
import { Label } from "../../../../components/ui/label";
import { Alert } from "../../../../components/ui/alert";
import { Badge } from "../../../../components/ui/badge";
import { ShieldCheck, Wifi, PlayCircle, FileCheck, FileQuestion, CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from "../../../../components/ui/toast";

export default function ManualBackupPage() {
  const params = useParams<{ deviceId: string }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Array<{ id: string; execution_id: string; step_key: string; status: string; detail: string | null; meta: any; created_at: string }>>([]);
  const [execStatus, setExecStatus] = useState<string>("pending");
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [execDetails, setExecDetails] = useState<{ status?: string; backup_id?: string | null; error_message?: string | null } | null>(null);
  const { show: showToast } = useToast();
  const [includeSkipped, setIncludeSkipped] = useState(false);
  const [deviceVendor, setDeviceVendor] = useState<string>("");
  const [reportSuccess, setReportSuccess] = useState<boolean>(true);
  const [reportError, setReportError] = useState<string>("");
  const [reportConfigPath, setReportConfigPath] = useState<string>("");

  const EXPECTED_STEPS: Array<{ key: string; title: string; description: string; instructions: string; weight: number }> = [
    { key: "precheck", title: "Ön Kontroller", description: "Disk alanı ve yazma izinleri kontrol edilir.", instructions: "Yedek dizininin yazılabilir olduğundan ve yeterli boş alan bulunduğundan emin olun.", weight: 2 },
    { key: "network_check", title: "Ağ Kontrolü", description: "Cihaza TCP bağlantısı test edilir.", instructions: "Cihazın yönetim IP ve portuna erişim olduğundan emin olun. Güvenlik duvarı kurallarını kontrol edin.", weight: 2 },
    { key: "execution_created", title: "İş Oluşturma", description: "Yedekleme çalışması oluşturulur.", instructions: "Oluşturulan çalışmanın kimliğini (Execution ID) not alın. Sistem tarafında kuyrukta bekler.", weight: 1 },
    { key: "report_received", title: "Sonuç Raporu", description: "Otomasyon tarafından sonuç raporu alınır.", instructions: "Başarı/başarısızlık durumunu, hata mesajını ve dosya yolunu inceleyin.", weight: 3 },
    { key: "postcheck_file", title: "Dosya Kontrolü", description: "Konfigürasyon dosyasının varlığı doğrulanır.", instructions: "Dosya yoksa yedek dizinini ve otomasyon servisini kontrol edin.", weight: 2 },
  ];

  const mergedStepsBase = EXPECTED_STEPS.map((s) => {
    const actual = steps.find((a) => a.step_key === s.key);
    return {
      key: s.key,
      title: s.title,
      description: s.description,
      instructions: s.instructions,
      status: actual ? actual.status : "pending",
      created_at: actual ? actual.created_at : null,
      detail: actual ? actual.detail : null,
      meta: actual ? actual.meta : null,
      weight: s.weight,
    };
  });
  const extraSteps = steps.filter((a) => !EXPECTED_STEPS.some((e) => e.key === a.step_key)).map((a) => ({
    key: a.step_key,
    title: a.step_key,
    description: "Ek adım",
    instructions: "Sistem tarafından eklenen adım. Ayrıntıları inceleyin.",
    status: a.status,
    created_at: a.created_at,
    detail: a.detail,
    meta: a.meta,
    weight: 1,
  }));
  const mergedSteps = [...mergedStepsBase, ...extraSteps];

  const totalWeight = mergedSteps.reduce((acc, s) => acc + (typeof (s as any).weight === "number" ? (s as any).weight : 1), 0);
  const completedWeight = mergedSteps.reduce((acc, s) => acc + ((s.status === "success" || (includeSkipped && s.status === "skipped")) ? ((s as any).weight ?? 1) : 0), 0);
  const overallProgress = Math.round((completedWeight / (totalWeight || 1)) * 100);

  async function reportClientError(payload: { route: string; method: string; statusCode?: number; code: string; message: string; stack?: string | undefined }) {
    try {
      const token = getToken();
      if (!token) return;
      await apiFetch("/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {}
  }

  async function startManualBackup() {
    setError("");
    setBusy(true);
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch("/backups/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: params.deviceId }),
      });
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        const j = await res.json().catch(() => ({}));
        const msg = j.message || "Başlatılamadı";
        setError(msg);
        await reportClientError({ route: "/backups/manual", method: "POST", statusCode: res.status, code: "manual_backup_failed", message: msg });
        return;
      }
      const j = await res.json();
      setExecutionId(String(j.executionId));
      setExecStatus("pending");
    } catch (e: any) {
      setError("Ağ hatası");
      const msg = e?.message ? String(e.message) : "Network error";
      await reportClientError({ route: "/backups/manual", method: "POST", code: "network_error", message: msg, stack: e?.stack });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { startManualBackup(); }, []);

  useEffect(() => {
    async function loadDevice() {
      try {
        const token = getToken();
        if (!token) { logout(); return; }
        const res = await apiFetch(`/devices/${params.deviceId}`);
        if (res.ok) {
          const j = await res.json();
          const v = j?.item?.vendor ? String(j.item.vendor) : "";
          setDeviceVendor(v);
        }
      } catch {}
    }
    loadDevice();
  }, [params.deviceId]);

  useEffect(() => {
    let t: any;
    let t2: any;
    async function poll() {
      if (!executionId) return;
      try {
        const token = getToken();
        if (!token) { logout(); return; }
        const res = await apiFetch(`/backup_steps/${params.deviceId}?executionId=${executionId}&limit=50&offset=0`);
        if (res.ok) {
          const j = await res.json();
          setSteps(j.items || []);
        }
      } catch {}
    }
    async function pollExec() {
      if (!executionId) return;
      try {
        const token = getToken();
        if (!token) { logout(); return; }
        const res = await apiFetch(`/executions/by-id/${executionId}`);
        if (res.ok) {
          const j = await res.json();
          if (j && j.status) setExecStatus(String(j.status));
          setExecDetails({ status: j?.status, backup_id: j?.backup_id ?? null, error_message: j?.error_message ?? null });
        }
      } catch {}
    }
    poll();
    pollExec();
    const done = execStatus === "success" || execStatus === "failed" || execStatus === "skipped";
    if (!done) {
      t = setInterval(poll, 1500);
      t2 = setInterval(pollExec, 2000);
    }
    return () => { if (t) clearInterval(t); if (t2) clearInterval(t2); };
  }, [executionId, params.deviceId, execStatus]);

  useEffect(() => {
    if (steps.length === 0) return;
    const order = EXPECTED_STEPS.map((s) => s.key);
    let idx = 0;
    for (let i = 0; i < order.length; i++) {
      const k = order[i];
      const found = steps.find((s) => s.step_key === k);
      if (found && found.status === "success") idx = i;
      else break;
    }
    setCurrentIdx(idx);
  }, [steps]);

  async function sendReport() {
    try {
      if (!executionId) { alert("Önce yedeği başlatın"); return; }
      const token = getToken();
      if (!token) { logout(); return; }
      const ts = new Date().toISOString();
      const payload: any = {
        deviceId: String(params.deviceId),
        vendor: deviceVendor || "hp_comware",
        backupTimestamp: ts,
        configPath: reportConfigPath && reportConfigPath.trim() ? reportConfigPath.trim() : null,
        configSha256: "",
        configSizeBytes: 0,
        success: reportSuccess,
        errorMessage: reportSuccess ? null : (reportError || null),
        jobId: null,
        executionId: executionId,
      };
      const res = await apiFetch(`/internal/backups/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        const j = await res.json().catch(() => ({}));
        alert(j.message || "Rapor gönderilemedi");
        return;
      }
      showToast({ variant: reportSuccess ? "success" : "error", message: reportSuccess ? "Rapor gönderildi" : "Hatalı rapor gönderildi", duration: 3000 });
      setTimeout(() => { setExecStatus(reportSuccess ? "success" : "failed"); }, 0);
    } catch {
      alert("Ağ hatası");
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
      a.download = `config_${id}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Ağ hatası");
    }
  }

  const statusIcon = (status: string) => (
    status === "success"
      ? <CheckCircle className="h-4 w-4 text-green-600" />
      : status === "failed"
      ? <AlertTriangle className="h-4 w-4 text-red-600" />
      : status === "skipped"
      ? <CheckCircle className="h-4 w-4 text-gray-500" />
      : <PlayCircle className="h-4 w-4 text-yellow-600" />
  );
  const stepIcon = (key: string) => (
    key === "precheck" ? <ShieldCheck className="h-4 w-4" /> :
    key === "network_check" ? <Wifi className="h-4 w-4" /> :
    key === "execution_created" ? <PlayCircle className="h-4 w-4" /> :
    key === "report_received" ? <FileCheck className="h-4 w-4" /> :
    key === "postcheck_file" ? <FileQuestion className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />
  );

  const [doneBanner, setDoneBanner] = useState<string | null>(null);
  useEffect(() => {
    if (execStatus === "success") setDoneBanner("Yedekleme başarıyla tamamlandı.");
    else if (execStatus === "failed") setDoneBanner("Yedekleme başarısız oldu. Ayrıntıları inceleyin.");
    else if (execStatus === "skipped") setDoneBanner("Yedekleme atlandı.");
    else setDoneBanner(null);
    if (execStatus === "success") {
      const hasBackup = !!execDetails?.backup_id;
      if (hasBackup) {
        showToast({ variant: "success", message: "Yedekleme tamamlandı", duration: 6000, actionLabel: "İndir", onAction: () => downloadBackup(String(execDetails!.backup_id)) });
      } else {
        showToast({ variant: "success", message: "Yedekleme tamamlandı", duration: 3000 });
      }
    }
    if (execStatus === "failed") { showToast({ variant: "error", message: "Yedekleme başarısız", duration: 0, actionLabel: "Yeniden dene", onAction: () => startManualBackup() }); }
  }, [execStatus, execDetails]);

  return (
    <AppShell>
      
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Manuel Yedek</h2>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/backups/${params.deviceId}`}>Geri</Link>
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive mb-2">{error}</p>}
      {doneBanner && (
        <Alert className="mb-3" variant={execStatus === "success" ? "success" : execStatus === "failed" ? "error" : "warning"}>{doneBanner}</Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cihaz: {params.deviceId}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Button disabled={busy} onClick={startManualBackup}>Yedeği Başlat</Button>
            {executionId && (
              <span className="text-sm">Execution: {executionId} • Durum: {execStatus}</span>
            )}
          </div>
          {executionId && (
            <div className="mt-4 border rounded p-3">
              <div className="text-sm font-medium mb-2">Sonuç Raporu</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="grid gap-1">
                  <Label>Vendor</Label>
                  <Input value={deviceVendor} onChange={(e) => setDeviceVendor(e.target.value)} />
                </div>
                <div className="grid gap-1">
                  <Label>Başarı</Label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" className="h-4 w-4" checked={reportSuccess} onChange={(e) => setReportSuccess(e.currentTarget.checked)} />
                    <span>Başarılı</span>
                  </label>
                </div>
                <div className="grid gap-1">
                  <Label>Konfigürasyon Dosya Yolu (opsiyonel)</Label>
                  <Input value={reportConfigPath} onChange={(e) => setReportConfigPath(e.target.value)} placeholder="/data/backups/.../config.cfg" />
                </div>
              </div>
              {!reportSuccess && (
                <div className="grid gap-1 mt-2">
                  <Label>Hata Mesajı</Label>
                  <Input value={reportError} onChange={(e) => setReportError(e.target.value)} />
                </div>
              )}
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={sendReport}>Raporu Gönder</Button>
              </div>
            </div>
          )}
          {execStatus === "success" && execDetails?.backup_id && (
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => downloadBackup(String(execDetails.backup_id))}>Yedeği İndir</Button>
            </div>
          )}
          {execStatus === "failed" && execDetails?.error_message && (
            <Alert className="mt-2" variant="error">Hata: {execDetails.error_message}</Alert>
          )}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <div className="text-xs">Genel İlerleme</div>
              <label className="flex items-center gap-2 text-xs">
                <Input type="checkbox" className="h-3 w-3" checked={includeSkipped} onChange={(e) => setIncludeSkipped(e.currentTarget.checked)} />
                <span>Skipped dahil</span>
              </label>
            </div>
            <Progress value={overallProgress} variant={execStatus === "failed" ? "danger" : overallProgress === 100 ? "success" : execStatus === "pending" ? "warning" : "primary"} />
            <div className="text-xs mt-1 text-muted-foreground">%{overallProgress}</div>
          </div>

          {executionId && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm">Süreç Adımları</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={currentIdx <= 0} onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}>Önceki</Button>
                  <Button variant="outline" size="sm" disabled={currentIdx >= mergedSteps.length - 1} onClick={() => setCurrentIdx((i) => Math.min(mergedSteps.length - 1, i + 1))}>Sonraki</Button>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-1 overflow-x-auto">
                {mergedSteps.map((s, idx) => (
                  <button key={`${s.key}-${idx}`} className={`flex items-center gap-1 px-2 py-1 rounded border ${idx === currentIdx ? "bg-muted" : "bg-background"}`} onClick={() => setCurrentIdx(idx)}>
                    {statusIcon(s.status)}
                    <span className="text-xs whitespace-nowrap">{s.title}</span>
                  </button>
                ))}
              </div>
              <div className="flex items-center mb-3 gap-1 w-full">
                {(() => {
                  const total = mergedSteps.reduce((acc, s) => acc + (typeof (s as any).weight === "number" ? (s as any).weight : 1), 0);
                  const pendingIndex = mergedSteps.findIndex((x) => x.status !== "success" && x.status !== "failed");
                  return mergedSteps.map((s, idx) => {
                    const color = s.status === "success" ? "bg-green-600" : s.status === "failed" ? "bg-red-600" : s.status === "skipped" ? "bg-gray-400" : "bg-yellow-500";
                    const pct = s.status === "success" || s.status === "failed" || s.status === "skipped" ? 100 : (idx === pendingIndex ? 60 : 0);
                    const widthPct = Math.round((((s as any).weight ?? 1) / total) * 1000) / 10;
                    return (
                      <div key={`seg-${s.key}-${idx}`} className="h-2 rounded bg-muted overflow-hidden" style={{ width: `${widthPct}%` }}>
                        <div className={`h-2 ${color} transition-all duration-700 ease-in-out ${s.status === "pending" && idx === pendingIndex ? "animate-pulse" : ""}`} style={{ width: `${pct}%` }} />
                      </div>
                    );
                  });
                })()}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {mergedSteps.map((s, idx) => (
                  <div key={s.key} className={`border rounded p-3 animate-in fade-in duration-300 ${idx === currentIdx ? "ring-1 ring-primary" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">{stepIcon(s.key)}<span>{s.title}</span></div>
                        <div className="text-xs text-muted-foreground">{s.description}</div>
                      </div>
                      <div className="text-xs">
                        <span className={s.status === "success" ? "text-green-600" : s.status === "failed" ? "text-red-600" : "text-yellow-600"}>{s.status === "pending" ? "bekleniyor" : s.status}</span>
                        {s.created_at && (
                          <span className="ml-2 text-muted-foreground">{new Date(s.created_at).toLocaleTimeString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      <Progress value={s.status === "success" ? 100 : s.status === "failed" ? 100 : s.status === "skipped" ? 100 : 0} variant={s.status === "success" ? "success" : s.status === "failed" ? "danger" : s.status === "skipped" ? "neutral" : "warning"} />
                    </div>
                    {s.meta && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {s.key === "precheck" && (
                          <>
                            {s.meta?.perms && <Badge>İzin: {s.meta.perms}</Badge>}
                            {s.meta?.disk?.availableKB !== undefined && <Badge>Boş: {Math.round((s.meta.disk.availableKB / 1024) * 10) / 10} MB</Badge>}
                            {s.meta?.disk?.capacity && <Badge>Kapasite: {s.meta.disk.capacity}</Badge>}
                            {s.meta?.root && <Badge>Kök: {s.meta.root}</Badge>}
                          </>
                        )}
                        {s.key === "network_check" && (
                          <>
                            {s.meta?.host && <Badge>Host: {s.meta.host}</Badge>}
                            {s.meta?.port && <Badge>Port: {s.meta.port}</Badge>}
                          </>
                        )}
                        {s.key === "report_received" && (
                          <>
                            {s.meta?.configPath && <Badge>Yol: {s.meta.configPath}</Badge>}
                            {s.meta?.sizeBytes !== undefined && <Badge>Boyut: {s.meta.sizeBytes} B</Badge>}
                            {s.meta?.sha256 && <Badge className="truncate max-w-[200px]">SHA256: {s.meta.sha256}</Badge>}
                          </>
                        )}
                        {s.key === "postcheck_file" && (
                          <>
                            {s.meta?.path && <Badge>Dosya: {s.meta.path}</Badge>}
                          </>
                        )}
                      </div>
                    )}
                    {idx === currentIdx && (
                      <div className="mt-3 text-xs text-muted-foreground animate-in fade-in slide-in-from-bottom-2">
                        <div className="mb-1 font-medium text-foreground">Talimatlar</div>
                        <p>{s.instructions}</p>
                        {s.detail && <p className="mt-1 text-foreground">Detay: {s.detail}</p>}
                      </div>
                    )}
                  </div>
                ))}
                {mergedSteps.length === 0 && execStatus === "pending" && (
                  <div className="border rounded p-3 animate-pulse">
                    <div className="h-4 w-40 bg-muted rounded" />
                    <div className="mt-2 h-2 w-full bg-muted rounded" />
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
