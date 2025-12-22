"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../components/ui/select";
import { AppShell } from "../../components/layout/app-shell";
import { apiFetch, logout, getToken } from "../../lib/utils";

type AlarmItem = { id: string; device_id: string; type: string; severity: string; message: string; acknowledged: boolean; created_at: string; resolved_at: string | null };
type Device = { id: string; name: string };

export default function AlarmsPage() {
  const [items, setItems] = useState<AlarmItem[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<string>("active");
  const [severity, setSeverity] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setError("");
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/alarms?status=${status}&limit=200`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Alarmlar alınamadı");
        return;
      }
      const j = await res.json();
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch {
      setError("Ağ hatası");
    } finally {
      setLoading(false);
    }
  }

  async function loadDevices() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/devices?limit=1000`);
      if (!res.ok) return;
      const j = await res.json();
      setDevices((j.items || []).map((d: any) => ({ id: d.id as string, name: d.name as string })));
    } catch {}
  }

  async function ack(id: string) {
    try {
      const res = await apiFetch(`/alarms/${id}/ack`, { method: "POST" });
      if (res.status === 204) load();
    } catch {}
  }

  useEffect(() => { loadDevices(); }, []);
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/alarms/preferences");
        if (res.ok) {
          const j = await res.json();
          setSeverity(j.alarmSeverity || "all");
          setType(j.alarmType || "all");
        }
      } catch {}
    })();
  }, []);
  useEffect(() => { setLoading(true); load(); }, [status]);

  const nameMap = useMemo(() => Object.fromEntries(devices.map(d => [d.id, d.name])), [devices]);
  const types = useMemo(() => Array.from(new Set(items.map(i => i.type))), [items]);
  const filtered = useMemo(() => {
    return items.filter((it) => {
      const okS = severity === "all" ? true : it.severity === severity;
      const okT = type === "all" ? true : it.type === type;
      return okS && okT;
    });
  }, [items, severity, type]);

  useEffect(() => {
    (async () => {
      try {
        await apiFetch("/alarms/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alarmSeverity: severity, alarmType: type }),
        });
      } catch {}
    })();
  }, [severity, type]);

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Alarmlar</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/devices">Cihazlar</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard">Genel Bakış</Link></Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <div className="w-40">
              <Select value={status} onValueChange={(v) => setStatus(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Durum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="acknowledged">Onaylı</SelectItem>
                  <SelectItem value="all">Tümü</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-36">
              <Select value={severity} onValueChange={(v) => setSeverity(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Önem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">(Tümü)</SelectItem>
                  <SelectItem value="warning">Uyarı</SelectItem>
                  <SelectItem value="critical">Kritik</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Select value={type} onValueChange={(v) => setType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Tip" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">(Tümü)</SelectItem>
                  {types.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={load}>Yenile</Button>
          </div>
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          {loading ? (
            <div className="text-sm text-muted-foreground">Yükleniyor...</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground">Veri yok</div>
          ) : (
            <div className="grid gap-2">
              {filtered.map((it) => (
                <div key={it.id} className="grid grid-cols-1 md:grid-cols-5 items-center gap-2 rounded-md border p-2">
                  <div className="font-medium truncate">{it.message}</div>
                  <div className="text-sm">Tip: {it.type}</div>
                  <div className="text-sm">Önem: {it.severity}</div>
                  <div className="text-sm truncate">Cihaz: {nameMap[it.device_id] || it.device_id}</div>
                  <div className="flex gap-2 md:justify-end">
                    {!it.acknowledged && <Button size="sm" variant="outline" onClick={() => ack(it.id)}>Onayla</Button>}
                    <Button size="sm" variant="outline" asChild><Link href={`/devices/${it.device_id}/status`}>Durum</Link></Button>
                  </div>
                  <div className="text-xs text-muted-foreground md:col-span-5">{new Date(it.created_at).toLocaleString()} {it.resolved_at ? `(çözüldü: ${new Date(it.resolved_at).toLocaleString()})` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
