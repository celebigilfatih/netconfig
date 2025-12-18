"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { apiFetch, logout } from "../../../../lib/utils";

export default function DiffPage() {
  const params = useParams<{ deviceId: string }>();
  const [diff, setDiff] = useState("");
  const [error, setError] = useState("");
  

  async function load() {
    setError("");
    try {
      const res = await apiFetch(`/backups/${params.deviceId}/diff`);
      if (!res.ok) {
        if (res.status === 401) { logout(); return; }
        setError("Diff alınamadı");
        return;
      }
      const data = await res.json();
      setDiff(data.diff || "");
    } catch {
      setError("Ağ hatası");
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Son İki Yedeğin Diff'i</h2>
        <Button variant="outline" asChild>
          <Link href={`/backups/${params.deviceId}`}>Geri</Link>
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Diff</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap text-sm">{diff}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
