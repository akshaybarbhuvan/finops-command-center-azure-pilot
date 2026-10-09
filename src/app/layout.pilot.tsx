import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { PilotProviders } from "@/components/pilot/Providers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "FinOps Command Center", template: "%s · FinOps Command Center" },
  description: "FinOps Command Center — single-organization Azure pilot.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0B1220", width: "device-width", initialScale: 1 };

export default function PilotRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PilotProviders>{children}</PilotProviders>
      </body>
    </html>
  );
}
