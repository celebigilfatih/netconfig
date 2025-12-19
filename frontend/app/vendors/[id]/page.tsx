"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { AppShell } from "../../../components/layout/app-shell";
import { apiFetch, logout, getToken } from "../../../lib/utils";

export default function EditVendorPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    const token = getToken();
    if (!token) { logout(); return; }
    const res = await apiFetch(`/vendors/${id}`);
    if (!res.ok) {
      if (res.status === 401) { logout(); return; }
      setError("Bulunamadı");
      return;
    }
    const j = await res.json();
    const it = j.item;
    setSlug(it.slug);
    setName(it.name);
    setIsActive(!!it.is_active);
  }

  async function submit() {
    setError("");
    const token = getToken();
    if (!token) { logout(); return; }
    const res = await apiFetch(`/vendors/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, isActive }) });
    if (res.ok) {
      router.push("/vendors");
      return;
    }
    if (res.status === 401) { logout(); return; }
    const j = await res.json().catch(() => ({} as any));
    setError(j?.message || "Kaydedilemedi");
  }

  useEffect(() => { if (id) load(); }, [id]);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold">Vendor Düzenle</h2>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Card>
          <CardHeader>
            <CardTitle>Bilgiler</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <div>
                <label className="text-sm">Slug</label>
                <Input value={slug} disabled />
              </div>
              <div>
                <label className="text-sm">Ad</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span>Aktif</span>
              </label>
              <div className="flex gap-2">
                <Button onClick={submit}>Kaydet</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
