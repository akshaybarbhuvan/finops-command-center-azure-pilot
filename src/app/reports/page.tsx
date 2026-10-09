import type { Metadata } from "next";
import { Suspense } from "react";
import { Reports } from "@/components/pages/Reports";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <Suspense>
      <Reports />
    </Suspense>
  );
}
