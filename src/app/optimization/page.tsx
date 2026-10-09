import type { Metadata } from "next";
import { Suspense } from "react";
import { Optimization } from "@/components/pages/Optimization";

export const metadata: Metadata = { title: "Optimization" };

export default function Page() {
  return (
    <Suspense>
      <Optimization />
    </Suspense>
  );
}
