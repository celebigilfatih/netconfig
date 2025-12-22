"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { AppShell } from "../../../../components/layout/app-shell";
import { apiFetch, logout, getToken } from "../../../../lib/utils";

type IfItem = { index: number; name: string; adminStatus: number | null; operStatus: number | null };

function st(n: number | null): string {
  if (n === 1) return "Açık";
  if (n === 2) return "Kapalı";
  if (n === 3) return "Test";
  return "-";
}

export default function DeviceInterfacesPage() {
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<IfItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [onlyDown, setOnlyDown] = useState(false);

  async function load() {
    setError("");
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/monitoring/devices/${params.id}/interfaces`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Arayüzler alınamadı");
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

  useEffect(() => { load(); }, []);

  return (
    <AppShell>
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Arayüzler</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/devices">Cihazlar</Link></Button>
          <Button asChild variant="outline"><Link href={`/devices/${params.id}/status`}>Durum</Link></Button>
          <Button asChild variant="outline"><Link href={`/devices/${params.id}/inventory`}>Envanter</Link></Button>
          <Button variant="outline" onClick={load}>Yenile</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Liste</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 mb-3">
            <input type="checkbox" className="h-4 w-4" checked={onlyDown} onChange={(e) => setOnlyDown(e.target.checked)} />
            <span>Sadece düşen</span>
          </label>
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          {loading ? (
            <div className="text-sm text-muted-foreground">Yükleniyor...</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">Veri yok</div>
          ) : (
            <div className="grid gap-2">
              {(onlyDown ? items.filter((x) => x.operStatus === 2) : items).map((it) => (
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
