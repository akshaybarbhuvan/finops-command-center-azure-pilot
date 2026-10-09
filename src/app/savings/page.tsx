import type { Metadata } from "next";
import { Suspense } from "react";
import { SavingsTracker } from "@/components/pages/SavingsTracker";

export const metadata: Metadata = { title: "Savings" };

export default function Page() {
  return (
    <Suspense>
      <SavingsTracker />
    </Suspense>
  );
}
