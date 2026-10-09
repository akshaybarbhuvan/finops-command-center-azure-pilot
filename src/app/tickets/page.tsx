import type { Metadata } from "next";
import { Suspense } from "react";
import { Tickets } from "@/components/pages/Tickets";

export const metadata: Metadata = { title: "Tickets" };

export default function Page() {
  return (
    <Suspense>
      <Tickets />
    </Suspense>
  );
}
