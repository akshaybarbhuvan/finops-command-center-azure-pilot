"use client";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/overlay";
export function PilotProviders({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
