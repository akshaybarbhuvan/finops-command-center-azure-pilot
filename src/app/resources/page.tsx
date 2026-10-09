import type { Metadata } from "next";
import { Suspense } from "react";
import { ResourceInventory } from "@/components/pages/ResourceInventory";

export const metadata: Metadata = { title: "Resources" };

export default function Page() {
  return (
    <Suspense>
      <ResourceInventory />
    </Suspense>
  );
}
