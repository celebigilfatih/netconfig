"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "../../../components/ui/card";
import { Label } from "../../../components/ui/label";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "../../../components/ui/select";
import { apiFetch, logout } from "../../../lib/utils";

export default function NewDevicePage() {
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [mgmtIp, setMgmtIp] = useState("");
  const [sshPort, setSshPort] = useState(22);
  const [vendor, setVendor] = useState("fortigate");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  

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
    if (!["fortigate", "cisco_ios", "mikrotik"].includes(vendor)) errs.vendor = "Vendor geçersiz";
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
    <div className="mx-auto max-w-2xl">
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
                  <SelectItem value="fortigate">FortiGate</SelectItem>
                  <SelectItem value="cisco_ios">Cisco IOS</SelectItem>
                  <SelectItem value="mikrotik">MikroTik</SelectItem>
                </SelectContent>
              </Select>
              {errors.vendor && <span className="text-sm text-destructive">{errors.vendor}</span>}
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
    </div>
  );
}
