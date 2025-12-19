"use client";
import { createContext, useContext, useMemo, useState } from "react";
import { Alert } from "../components/ui/alert";
import { Button } from "../components/ui/button";

type AlertItem = { id: string; variant: "success" | "error" | "info" | "warning"; message: string };

type AlertsContextType = {
  push: (a: Omit<AlertItem, "id">) => void;
  dismiss: (id: string) => void;
  items: AlertItem[];
};

const AlertsContext = createContext<AlertsContextType | null>(null);

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<AlertItem[]>([]);
  const api = useMemo(
    () => ({
      push: (a: Omit<AlertItem, "id">) => setItems((prev) => [...prev, { id: crypto.randomUUID(), ...a }]),
      dismiss: (id: string) => setItems((prev) => prev.filter((x) => x.id !== id)),
      items,
    }),
    [items]
  );
  return <AlertsContext.Provider value={api}>{children}</AlertsContext.Provider>;
}

export function useAlerts(): AlertsContextType {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error("AlertsProvider missing");
  return ctx;
}

export function AlertStack() {
  const { items, dismiss } = useAlerts();
  return (
    <div className="fixed bottom-4 right-4 z-50 grid gap-2 w-[90vw] max-w-sm">
      {items.map((it) => (
        <Alert key={it.id} variant={it.variant} className="flex items-center justify-between">
          <span>{it.message}</span>
          <Button variant="outline" size="sm" onClick={() => dismiss(it.id)}>Kapat</Button>
        </Alert>
      ))}
    </div>
  );
}

