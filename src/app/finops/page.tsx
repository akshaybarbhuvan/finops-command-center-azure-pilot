import type { Metadata } from "next";
import { Suspense } from "react";
import { FinOpsWorkbench } from "@/components/pages/FinOpsWorkbench";

export const metadata: Metadata = { title: "FinOps Workbench" };

export default function Page() {
  return (
    <Suspense>
      <FinOpsWorkbench />
    </Suspense>
  );
}
