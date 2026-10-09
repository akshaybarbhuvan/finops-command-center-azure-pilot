"use client";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/overlay";
import { DemoProvider } from "@/lib/demo/store";
import { AppShell } from "./AppShell";

export function Providers({ children, clientLabel }: { children: ReactNode; clientLabel: string }) {
  return (
    <DemoProvider clientLabel={clientLabel}>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </DemoProvider>
  );
}
