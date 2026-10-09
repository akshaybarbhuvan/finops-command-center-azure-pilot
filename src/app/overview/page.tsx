import type { Metadata } from "next";
import { ExecutiveOverview } from "@/components/pages/ExecutiveOverview";

export const metadata: Metadata = { title: "Executive Overview" };

export default function Page() {
  return <ExecutiveOverview />;
}
