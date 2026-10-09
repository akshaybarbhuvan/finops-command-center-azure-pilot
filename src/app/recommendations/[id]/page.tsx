import type { Metadata } from "next";
import { RecommendationDetail } from "@/components/pages/RecommendationDetail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: id };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RecommendationDetail id={decodeURIComponent(id)} />;
}
