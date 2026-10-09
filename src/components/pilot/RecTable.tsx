import Link from "next/link";
import type { RecListRow } from "@/pilot/queries/recommendations";
import { SimpleTable, StageBadge, shortSub, td } from "./ui";

/** Recommendation grid. By design it shows no savings figures; amounts appear on the detail page and in exports. */
export function RecTable({ rows, caption, showOwner = true }: { rows: RecListRow[]; caption: string; showOwner?: boolean }) {
  return (
    <SimpleTable
      caption={caption}
      head={["Recommendation", "Category", "Priority", "Stage", ...(showOwner ? ["Owner"] : []), "Due", "Subscription"]}
      empty={!rows.length ? <p className="py-6 text-center text-sm text-slate-500">No recommendations match.</p> : null}
    >
      {rows.map((r) => (
        <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
          <td className={td}>
            <Link href={`/recommendations/${r.id}`} className="font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
              {r.problem}
            </Link>
            <div className="text-xs text-slate-500">
              {r.impactedName ?? "—"}
              {r.impactedType ? ` · ${r.impactedType}` : ""}
              {r.sourceStatus === "not_returned" ? " · no longer returned by Advisor" : ""}
            </div>
          </td>
          <td className={td}>{r.category}</td>
          <td className={td}>{r.priority}</td>
          <td className={td}>
            <StageBadge stage={r.stage} />
          </td>
          {showOwner && <td className={td}>{r.ownerName ?? <span className="text-slate-400">Unassigned</span>}</td>}
          <td className={td}>{r.dueDate ?? "—"}</td>
          <td className={`${td} font-mono text-xs`}>{shortSub(r.subscriptionId)}</td>
        </tr>
      ))}
    </SimpleTable>
  );
}
