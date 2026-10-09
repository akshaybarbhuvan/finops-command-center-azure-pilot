"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDemoSession } from "@/lib/demo/store";
import { HOME } from "@/lib/rbac";

export default function Home() {
  const { user, hydrated } = useDemoSession();
  const router = useRouter();
  useEffect(() => {
    if (hydrated) router.replace(user ? HOME[user.role] : "/login");
  }, [hydrated, user, router]);
  return <p className="sr-only">Opening your home dashboard…</p>;
}
