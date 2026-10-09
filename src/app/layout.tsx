import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { clientLabel, isDemoBypassAllowed, resolveAppMode } from "@/lib/app-mode";
import { Providers } from "@/components/shell/Providers";
import { PilotGate } from "@/components/shell/PilotGate";

// Mode is resolved at request time so a build can never silently carry demo access into pilot/production.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "FinOps Command Center", template: "%s · FinOps Command Center" },
  description: "Enterprise FinOps Governance & Optimization Platform — local demo edition with illustrative data.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0B1220", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  const mode = resolveAppMode();
  return (
    <html lang="en">
      <body>{isDemoBypassAllowed(mode) ? <Providers clientLabel={clientLabel()}>{children}</Providers> : <PilotGate mode={mode} />}</body>
    </html>
  );
}
