"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../../../components/ui/card";
import { Label } from "../../../components/ui/label";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../../components/ui/select";
import { apiFetch, logout, getToken } from "../../../lib/utils";
import { AppShell } from "../../../components/layout/app-shell";

type Vendor = { id: string; slug: string; name: string; is_active: boolean };

export default function NewDevicePage() {
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [mgmtIp, setMgmtIp] = useState("");
  const [sshPort, setSshPort] = useState(22);
  const [vendor, setVendor] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorModal, setVendorModal] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorSlug, setVendorSlug] = useState("");
  const [vendorActive, setVendorActive] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  
  useEffect(() => { loadVendors(); }, []);


  async function loadVendors() {
    try {
      const token = getToken();
      if (!token) { logout(); return; }
      const res = await apiFetch(`/vendors?isActive=true&limit=1000`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        return;
      }
      const j = await res.json();
      setVendors(j.items || []);
      if (!vendor && (j.items || []).length) setVendor((j.items || [])[0].slug);
    } catch {}
  }

  function normSlug(s: string) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  async function createVendorInline() {
    const s = normSlug(vendorSlug || vendorName);
    if (!vendorName.trim()) return;
    const res = await apiFetch(`/vendors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: s, name: vendorName, isActive: vendorActive }) });
    if (res.status === 201) {
      await loadVendors();
      setVendor(s);
      setVendorModal(false);
      setVendorName("");
      setVendorSlug("");
      setVendorActive(true);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setErrors({});
    const errs: Record<string, string> = {};
    const ipParts = mgmtIp.split(".");
    const ipValid = ipParts.length === 4 && ipParts.every((p) => {
      const n = Number(p);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
    if (!name.trim()) errs.name = "Ad zorunlu";
    if (!ipValid) errs.mgmtIp = "Geçerli IPv4 girin";
    if (!sshPort || sshPort < 1 || sshPort > 65535) errs.sshPort = "Geçerli port girin";
    if (!username.trim()) errs.username = "Kullanıcı zorunlu";
    if (!password || password.length < 4) errs.password = "Şifre en az 4 karakter";
    if (!vendor.trim()) errs.vendor = "Vendor seçin";
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    try {
      setIsSubmitting(true);
      const body: any = { name, hostname, mgmtIp, sshPort, vendor, username, password, isActive: true };
      if (secret) body.secret = secret;
      const res = await apiFetch(`/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Oluşturma başarısız");
        setIsSubmitting(false);
        return;
      }
      router.push("/devices");
    } catch {
      setError("Ağ hatası");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
    <AppShell>
      <Card>
        <CardHeader>
          <CardTitle>Yeni Cihaz</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="name">Ad</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
              {errors.name && <span className="text-sm text-destructive">{errors.name}</span>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="hostname">Hostname</Label>
              <Input id="hostname" value={hostname} onChange={(e) => setHostname(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="mgmt">Yönetim IP</Label>
              <Input id="mgmt" value={mgmtIp} onChange={(e) => setMgmtIp(e.target.value)} aria-invalid={!!errors.mgmtIp} />
              {errors.mgmtIp && <span className="text-sm text-destructive">{errors.mgmtIp}</span>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ssh">SSH Port</Label>
              <Input id="ssh" type="number" value={sshPort} onChange={(e) => setSshPort(Number(e.target.value))} aria-invalid={!!errors.sshPort} />
              {errors.sshPort && <span className="text-sm text-destructive">{errors.sshPort}</span>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor">Vendor</Label>
              <Select value={vendor} onValueChange={(v) => setVendor(v)}>
                <SelectTrigger id="vendor" aria-invalid={!!errors.vendor}>
                  <SelectValue placeholder="Vendor seçin" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.slug}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.vendor && <span className="text-sm text-destructive">{errors.vendor}</span>}
              {vendors.length === 0 && (
                <div className="text-xs text-muted-foreground">
                  Listede vendor yok. <Link className="underline" href="/vendors/new">Yeni vendor oluştur</Link>
                </div>
              )}
              <div className="mt-2">
                <Button size="sm" variant="outline" onClick={() => setVendorModal(true)}>Yeni vendor</Button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="username">Kullanıcı</Label>
              <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} aria-invalid={!!errors.username} />
              {errors.username && <span className="text-sm text-destructive">{errors.username}</span>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Şifre</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
              {errors.password && <span className="text-sm text-destructive">{errors.password}</span>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="secret">Secret (opsiyonel)</Label>
              <Input id="secret" value={secret} onChange={(e) => setSecret(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
        <CardFooter>
          <Button type="submit" onClick={onSubmit} disabled={isSubmitting} className="ml-auto">
            {isSubmitting ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </CardFooter>
      </Card>
    </AppShell>
    {vendorModal && (
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-black/40" onClick={() => setVendorModal(false)} />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-card text-card-foreground rounded-md border shadow-lg">
          <div className="p-4">
            <div className="text-lg font-semibold mb-3">Yeni Vendor</div>
            <div className="grid gap-3">
              <div>
                <label className="text-sm">Ad</label>
                <Input value={vendorName} onChange={(e) => { setVendorName(e.target.value); if (!vendorSlug) setVendorSlug(normSlug(e.target.value)); }} />
              </div>
              <div>
                <label className="text-sm">Slug</label>
                <Input value={vendorSlug} onChange={(e) => setVendorSlug(e.target.value)} />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={vendorActive} onChange={(e) => setVendorActive(e.target.checked)} />
                <span>Aktif</span>
              </label>
              <div className="flex gap-2">
                <Button onClick={createVendorInline}>Kaydet</Button>
                <Button variant="outline" onClick={() => setVendorModal(false)}>Kapat</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
