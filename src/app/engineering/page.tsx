import type { Metadata } from "next";
import { Suspense } from "react";
import { EngineeringQueue } from "@/components/pages/EngineeringQueue";

export const metadata: Metadata = { title: "Engineering Work Queue" };

export default function Page() {
  return (
    <Suspense>
      <EngineeringQueue />
    </Suspense>
  );
}
