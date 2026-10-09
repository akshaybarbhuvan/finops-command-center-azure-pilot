import type { Metadata } from "next";
import { Suspense } from "react";
import { BudgetsForecast } from "@/components/pages/BudgetsForecast";

export const metadata: Metadata = { title: "Budgets & Forecast" };

export default function Page() {
  return (
    <Suspense>
      <BudgetsForecast />
    </Suspense>
  );
}
