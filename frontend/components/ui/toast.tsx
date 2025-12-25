"use client";
import React, { createContext, useContext, useState, useCallback } from "react";
import { Alert } from "./alert";
import { Button } from "./button";

type ToastItem = { id: string; variant: "success" | "error" | "warning" | "info"; message: string; duration?: number; closing?: boolean };
type ToastItemWithAction = ToastItem & { actionLabel?: string; onAction?: () => void };
type ToastCtx = { show: (t: Omit<ToastItemWithAction, "id">) => void; close: (id: string) => void };

const ToastContext = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItemWithAction[]>([]);

  const close = useCallback((id: string) => {
    setItems((prev) => prev.map((t) => t.id === id ? { ...t, closing: true } : t));
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const show = useCallback((t: Omit<ToastItemWithAction, "id">) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const item: ToastItemWithAction = { id, ...t };
    setItems((prev) => [...prev, item]);
    const duration = typeof t.duration === "number" ? t.duration : 3000;
    if (duration > 0) {
      setTimeout(() => close(id), duration);
    }
  }, [close]);

  return (
    <ToastContext.Provider value={{ show, close }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {items.map((t) => (
          <div key={t.id} className={t.closing ? "animate-out fade-out slide-out-to-top-2" : "animate-in fade-in slide-in-from-top-2"}>
            <Alert variant={t.variant} className="shadow-lg flex items-center justify-between gap-3">
              <span>{t.message}</span>
              <div className="flex items-center gap-2">
                {t.actionLabel && (
                  <Button size="sm" onClick={() => { t.onAction?.(); close(t.id); }}>{t.actionLabel}</Button>
                )}
                <Button size="sm" variant="outline" onClick={() => close(t.id)}>Kapat</Button>
              </div>
            </Alert>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
