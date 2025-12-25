"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { AppShell } from "../../components/layout/app-shell";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../components/ui/select";
import { useAlerts } from "../../lib/alerts";
import { apiFetch, logout, cn, getToken } from "../../lib/utils";
import { Badge } from "../../components/ui/badge";
import { vendorToneClasses, vendorIcon } from "../../lib/vendor";
import { useToast } from "../../components/ui/toast";
import { Trash2 } from "lucide-react";

type Vendor = { id: string; slug: string; name: string; is_active: boolean };

export default function VendorsPage() {
  return (
    <AppShell>
      <VendorsContent />
    </AppShell>
  );
}

function VendorsContent() {
  const [items, setItems] = useState<Vendor[]>([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [isActiveFilter, setIsActiveFilter] = useState<"all" | "active" | "passive">("all");
  const { show: showToast } = useToast();
  const { push } = useAlerts();

  async function load() {
    setError("");
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (isActiveFilter !== "all") params.set("isActive", String(isActiveFilter === "active"));
      const qs = params.toString();
      const res = await apiFetch(qs ? `/vendors?${qs}` : "/vendors");
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Veri alınamadı");
        return;
      }
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      setError("Ağ hatası");
    }
  }

  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    if (!confirm("Silmek istediğinize emin misiniz?")) return;
    const token = getToken();
    if (!token) { logout(); return; }
    const res = await apiFetch(`/vendors/${id}`, { method: "DELETE" });
    if (res.status === 204) {
      setItems((prev) => prev.filter((v) => v.id !== id));
      showToast({ variant: "success", message: "Vendor silindi", duration: 3000 });
      return;
    }
    const j = await res.json().catch(() => ({} as any));
    if (res.status === 409) {
      showToast({ variant: "error", message: "Vendor cihazlar tarafından kullanıldığı için silinemedi", duration: 3000 });
      return;
    }
    showToast({ variant: "error", message: j?.message || "Silinemedi", duration: 3000 });
  }

  async function toggleActive(id: string, current: boolean) {
    const token = getToken();
    if (!token) { logout(); return; }
    const res = await apiFetch(`/vendors/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current }),
    });
    if (res.ok) {
      setItems((prev) => prev.map((v) => v.id === id ? { ...v, is_active: !current } : v));
      showToast({ variant: "success", message: !current ? "Vendor aktifleştirildi" : "Vendor pasifleştirildi", duration: 3000 });
    } else {
      const j = await res.json().catch(() => ({} as any));
      showToast({ variant: "error", message: j?.message || "Güncellenemedi", duration: 3000 });
    }
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Vendorlar</h2>
          <div className="flex gap-2">
            <Button asChild><Link href="/vendors/new">Yeni Vendor</Link></Button>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        <Card>
          <CardHeader>
            <CardTitle>Liste</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 mb-3">
              <div className="flex-1"><Input placeholder="Ara" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <Select value={isActiveFilter} onValueChange={(val) => { setIsActiveFilter(val as any); setTimeout(() => { load(); }, 0); }}>
                <SelectTrigger className="w-[9rem]">
                  <SelectValue placeholder="Durum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="passive">Pasif</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={load}>Ara</Button>
            </div>
            <ul className="space-y-2">
              {items.map((v) => (
                <li key={v.id} className="flex items-center gap-2 rounded-md border p-3">
                  <div className="flex-1">
                    <div className="font-medium flex items-center gap-2">
                      <span>{v.name}</span>
                      <Badge className={cn("gap-1", vendorToneClasses(v.slug))}>
                        {vendorIcon(v.slug)}
                        <span>{v.slug}</span>
                      </Badge>
                    </div>
                <div className="text-xs text-muted-foreground">Durum: {v.is_active ? "Aktif" : "Pasif"}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => remove(v.id)} aria-label="Sil" title="Sil" className="shadow-none border-none bg-transparent hover:bg-transparent transition-transform hover:scale-[1.02] active:scale-[0.98]">
                <Trash2 className="h-4 w-4" />
              </Button>
              <label className="relative inline-flex items-center cursor-pointer select-none" title="Aktifleştir/Pasifleştir">
                <input type="checkbox" className="sr-only peer" checked={v.is_active} onChange={() => toggleActive(v.id, v.is_active)} aria-label="Aktifleştir/Pasifleştir" />
                <div className="w-10 h-6 bg-muted peer-checked:bg-green-600 rounded-full transition-colors">
                  <div className="h-5 w-5 bg-white rounded-full shadow transform translate-x-0 peer-checked:translate-x-4 transition-transform mt-0.5 ml-0.5" />
                </div>
              </label>
              {v.is_active ? (
                <Badge className="ml-2 bg-green-100 text-green-800 border-green-200">Aktif</Badge>
              ) : (
                <Badge className="ml-2 bg-gray-100 text-gray-700 border-gray-200">Pasif</Badge>
              )}
              <Button size="sm" variant="outline" asChild><Link href={`/vendors/${v.id}`}>Düzenle</Link></Button>
            </li>
          ))}
          {items.length === 0 && <li className="text-sm text-muted-foreground">Kayıt yok</li>}
        </ul>
      </CardContent>
    </Card>
      </div>

    </>
  );
}
