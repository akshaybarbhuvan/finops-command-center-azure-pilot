import type { Metadata } from "next";
import { Suspense } from "react";
import { Roadmap } from "@/components/pages/Roadmap";

export const metadata: Metadata = { title: "Roadmap" };

export default function Page() {
  return (
    <Suspense>
      <Roadmap />
    </Suspense>
  );
}
