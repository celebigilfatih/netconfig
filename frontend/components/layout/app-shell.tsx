"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { logout, cn } from "../../lib/utils";
import { Menu, LayoutDashboard, Server, History, Package, Bell, Activity } from "lucide-react";
import { AlertsProvider, AlertStack } from "../../lib/alerts";
import { ToastProvider } from "../ui/toast";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <AlertsProvider>
    <ToastProvider>
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center bg-card text-card-foreground px-3 md:px-6 py-2 border-b">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Menüyü aç">
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/dashboard" className="text-lg font-semibold">NetCFG</Link>
        <div className="ml-auto flex items-center gap-2 w-full md:w-auto">
          <div className="flex-1 min-w-0">
            <Input placeholder="Ara" aria-label="Ara" className="w-full" />
          </div>
          <Button variant="outline" onClick={logout}>Çıkış</Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-[20rem_1fr] flex-1 items-start">
        <aside className="bg-card text-card-foreground hidden md:block border-r md:self-stretch">
          <div className="p-4">
            <div className="text-lg font-semibold">Menü</div>
          </div>
          <nav className="p-2 grid gap-1">
            <div className="px-2 py-1 text-xs text-muted-foreground">Genel</div>
            <Button
              variant="ghost"
              asChild
              className={cn("justify-start", pathname.startsWith("/dashboard") ? "bg-muted" : undefined)}
              aria-current={pathname.startsWith("/dashboard") ? "page" : undefined}
            >
              <Link href="/dashboard"><LayoutDashboard className="mr-2 h-4 w-4" />Genel Bakış</Link>
            </Button>
            <div className="px-2 py-1 text-xs text-muted-foreground">Uyarılar</div>
            <Button
              variant="ghost"
              asChild
              className={cn("justify-start", pathname.startsWith("/alarms") ? "bg-muted" : undefined)}
              aria-current={pathname.startsWith("/alarms") ? "page" : undefined}
            >
              <Link href="/alarms"><Bell className="mr-2 h-4 w-4" />Alarmlar</Link>
            </Button>
            <div className="px-2 py-1 text-xs text-muted-foreground">İzleme</div>
            <Button
              variant="ghost"
              asChild
              className={cn("justify-start", pathname.startsWith("/monitoring") ? "bg-muted" : undefined)}
              aria-current={pathname.startsWith("/monitoring") ? "page" : undefined}
            >
              <Link href="/monitoring"><Activity className="mr-2 h-4 w-4" />İzleme</Link>
            </Button>
            <div className="px-2 py-1 text-xs text-muted-foreground">Cihazlar</div>
            <Button
              variant="ghost"
              asChild
              className={cn("justify-start", pathname.startsWith("/devices") ? "bg-muted" : undefined)}
              aria-current={pathname.startsWith("/devices") ? "page" : undefined}
            >
              <Link href="/devices"><Server className="mr-2 h-4 w-4" />Cihazlar</Link>
            </Button>
            <div className="px-2 py-1 text-xs text-muted-foreground">Yedekler</div>
            <Button
              variant="ghost"
              asChild
              className={cn("justify-start", pathname.startsWith("/backups") ? "bg-muted" : undefined)}
              aria-current={pathname.startsWith("/backups") ? "page" : undefined}
            >
              <Link href="/backups"><History className="mr-2 h-4 w-4" />Yedekler</Link>
            </Button>
            <div className="px-2 py-1 text-xs text-muted-foreground">Vendorlar</div>
            <Button
              variant="ghost"
              asChild
              className={cn("justify-start", pathname.startsWith("/vendors") ? "bg-muted" : undefined)}
              aria-current={pathname.startsWith("/vendors") ? "page" : undefined}
            >
              <Link href="/vendors"><Package className="mr-2 h-4 w-4" />Vendorlar</Link>
            </Button>
          </nav>
        </aside>

        <main className="flex flex-col gap-4 px-3 md:px-6">{children}</main>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[85vw] sm:w-80 bg-card text-card-foreground shadow-lg">
            <div className="p-4 border-b flex items-center justify-between">
              <div className="text-lg font-semibold">Menü</div>
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Kapat</Button>
            </div>
            <nav className="p-2 grid gap-1">
              <div className="px-2 py-1 text-xs text-muted-foreground">Genel</div>
              <Button variant="ghost" asChild className={cn("justify-start", pathname.startsWith("/dashboard") ? "bg-muted" : undefined)} onClick={() => setOpen(false)} aria-current={pathname.startsWith("/dashboard") ? "page" : undefined}>
                <Link href="/dashboard"><LayoutDashboard className="mr-2 h-4 w-4" />Genel Bakış</Link>
              </Button>
              <div className="px-2 py-1 text-xs text-muted-foreground">Uyarılar</div>
              <Button variant="ghost" asChild className={cn("justify-start", pathname.startsWith("/alarms") ? "bg-muted" : undefined)} onClick={() => setOpen(false)} aria-current={pathname.startsWith("/alarms") ? "page" : undefined}>
                <Link href="/alarms"><Bell className="mr-2 h-4 w-4" />Alarmlar</Link>
              </Button>
              <div className="px-2 py-1 text-xs text-muted-foreground">İzleme</div>
              <Button variant="ghost" asChild className={cn("justify-start", pathname.startsWith("/monitoring") ? "bg-muted" : undefined)} onClick={() => setOpen(false)} aria-current={pathname.startsWith("/monitoring") ? "page" : undefined}>
                <Link href="/monitoring"><Activity className="mr-2 h-4 w-4" />İzleme</Link>
              </Button>
              <div className="px-2 py-1 text-xs text-muted-foreground">Cihazlar</div>
              <Button variant="ghost" asChild className={cn("justify-start", pathname.startsWith("/devices") ? "bg-muted" : undefined)} onClick={() => setOpen(false)} aria-current={pathname.startsWith("/devices") ? "page" : undefined}>
                <Link href="/devices"><Server className="mr-2 h-4 w-4" />Cihazlar</Link>
              </Button>
              <div className="px-2 py-1 text-xs text-muted-foreground">Yedekler</div>
              <Button variant="ghost" asChild className={cn("justify-start", pathname.startsWith("/backups") ? "bg-muted" : undefined)} onClick={() => setOpen(false)} aria-current={pathname.startsWith("/backups") ? "page" : undefined}>
                <Link href="/backups"><History className="mr-2 h-4 w-4" />Yedekler</Link>
              </Button>
              <div className="px-2 py-1 text-xs text-muted-foreground">Vendorlar</div>
              <Button variant="ghost" asChild className={cn("justify-start", pathname.startsWith("/vendors") ? "bg-muted" : undefined)} onClick={() => setOpen(false)} aria-current={pathname.startsWith("/vendors") ? "page" : undefined}>
                <Link href="/vendors"><Package className="mr-2 h-4 w-4" />Vendorlar</Link>
              </Button>
              <Button variant="outline" className="justify-start mt-2" onClick={() => { setOpen(false); logout(); }}>Çıkış</Button>
            </nav>
          </div>
        </div>
      )}
      <AlertStack />
    </div>
    </ToastProvider>
    </AlertsProvider>
  );
}
