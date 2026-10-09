import type { Metadata } from "next";
import { Suspense } from "react";
import { Governance } from "@/components/pages/Governance";

export const metadata: Metadata = { title: "Governance" };

export default function Page() {
  return (
    <Suspense>
      <Governance />
    </Suspense>
  );
}
