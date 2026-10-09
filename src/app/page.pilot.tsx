import { redirect } from "next/navigation";
import { pageSession } from "@/components/pilot/guard";
import { homeFor } from "@/pilot/auth/principal";

export default async function Home() {
  const s = await pageSession([]);
  if (!s.ok) return s.view;
  redirect(homeFor(s.actor));
}
