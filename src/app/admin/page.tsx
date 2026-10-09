import type { Metadata } from "next";
import { Suspense } from "react";
import { Administration } from "@/components/pages/Administration";

export const metadata: Metadata = { title: "Administration" };

export default function Page() {
  return (
    <Suspense>
      <Administration />
    </Suspense>
  );
}
