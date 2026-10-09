import type { Metadata } from "next";
import { Suspense } from "react";
import { RecommendationsCenter } from "@/components/pages/RecommendationsCenter";

export const metadata: Metadata = { title: "Recommendations" };

export default function Page() {
  return (
    <Suspense>
      <RecommendationsCenter />
    </Suspense>
  );
}
