"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { AppShell } from "../../../../components/layout/app-shell";
import { apiFetch, logout, getToken } from "../../../../lib/utils";

type Inv = { model: string | null; firmware: string | null; serial: string | null };

export default function DeviceInventoryPage() {
  const params = useParams<{ id: string }>();
  const [inv, setInv] = useState<Inv | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setError("");
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/monitoring/devices/${params.id}/inventory`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Envanter alınamadı");
        return;
      }
      const j = await res.json();
      setInv({ model: j.model ?? null, firmware: j.firmware ?? null, serial: j.serial ?? null });
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
        <h2 className="text-2xl font-semibold">Envanter</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href="/devices">Cihazlar</Link></Button>
          <Button asChild variant="outline"><Link href={`/devices/${params.id}/status`}>Durum</Link></Button>
          <Button asChild variant="outline"><Link href={`/devices/${params.id}/interfaces`}>Arayüzler</Link></Button>
          <Button variant="outline" onClick={load}>Yenile</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bilgiler</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <p className="text-sm text-destructive mb-2">{error}</p>}
          {loading ? (
            <div className="text-sm text-muted-foreground">Yükleniyor...</div>
          ) : !inv ? (
            <div className="text-sm text-muted-foreground">Veri yok</div>
          ) : (
            <div className="grid gap-3">
              <div className="rounded-md border p-3">
                <div className="text-sm text-muted-foreground">Model</div>
                <div className="font-medium">{inv.model || "-"}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-sm text-muted-foreground">Yazılım</div>
                <div className="font-medium">{inv.firmware || "-"}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-sm text-muted-foreground">Seri No</div>
                <div className="font-medium">{inv.serial || "-"}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

