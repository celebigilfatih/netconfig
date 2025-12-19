"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { apiFetch } from "../../lib/utils";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("default");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const emailOk = /.+@.+\..+/.test(email);
    if (!emailOk) {
      setError("Geçerli bir e-posta girin");
      return;
    }
    if (!password || password.length < 8) {
      setError("Şifre en az 8 karakter olmalı");
      return;
    }
    if (!tenantSlug.trim()) {
      setError("Tenant zorunlu");
      return;
    }
    try {
      setIsSubmitting(true);
      const res = await apiFetch(`/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, tenantSlug })
      });
      if (!res.ok) {
        setError("Giriş başarısız");
        setIsSubmitting(false);
        return;
      }
      const data = await res.json();
      localStorage.setItem("netcfg_token", data.token);
      router.push("/dashboard");
    } catch (err) {
      setError("Ağ hatası");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Giriş</CardTitle>
          <CardDescription>Hesabınıza erişmek için bilgilerinizi girin</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="email">E-posta</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!/.+@.+\..+/.test(email) && !!email} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Şifre</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!password && password.length < 8} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tenant">Tenant</Label>
              <Input id="tenant" value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
        <CardFooter>
          <Button type="submit" onClick={onSubmit} disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
