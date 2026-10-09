import type { Metadata } from "next";
import { Suspense } from "react";
import { CostSpend } from "@/components/pages/CostSpend";

export const metadata: Metadata = { title: "Cost & Spend" };

export default function Page() {
  return (
    <Suspense>
      <CostSpend />
    </Suspense>
  );
}
