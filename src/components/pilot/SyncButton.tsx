"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/overlay";

/** Manual refresh of all Azure sources. Server enforces the role, rate limit and single-run lock. */
export function SyncButton() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/sync", { method: "POST", headers: { "content-type": "application/json", "x-fcc-request": "1" }, body: JSON.stringify({}) });
      const data = (await res.json().catch(() => ({}))) as { message?: string; summary?: string };
      if (!res.ok) toast({ kind: "error", title: "Refresh not started", body: data.message ?? `HTTP ${res.status}` });
      else toast({ kind: "success", title: "Refresh started", body: data.summary ?? "See connector status for per-source results." });
      router.refresh();
    } catch {
      toast({ kind: "error", title: "Refresh failed", body: "Network error." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button onClick={run} loading={busy} icon={<RefreshCw className="h-4 w-4" aria-hidden />}>
      Refresh Azure data now
    </Button>
  );
}
