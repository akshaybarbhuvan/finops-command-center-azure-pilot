import type { Metadata } from "next";
import { Suspense } from "react";
import { AnomalyCenter } from "@/components/pages/AnomalyCenter";

export const metadata: Metadata = { title: "Anomalies" };

export default function Page() {
  return (
    <Suspense>
      <AnomalyCenter />
    </Suspense>
  );
}
