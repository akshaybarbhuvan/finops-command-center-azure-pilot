// Central row-level authorization. Every page, selector, search, export, count and metric reads the dataset
// through scopeDataset, so an engineering owner never receives records that are not assigned to them.
import { canViewRec } from "./workflow";
import type { Dataset, User } from "./types";

export { canViewRec };

const cache = new WeakMap<Dataset, Map<string, Dataset>>();

export function scopeDataset(ds: Dataset, user: User): Dataset {
  if (user.role !== "engineering") return ds;
  let byUser = cache.get(ds);
  if (!byUser) {
    byUser = new Map();
    cache.set(ds, byUser);
  }
  const hit = byUser.get(user.id);
  if (hit) return hit;
  const recommendations = ds.recommendations.filter((r) => canViewRec(user, r));
  const visible = new Set(recommendations.map((r) => r.id));
  const tickets = ds.tickets.filter((t) => visible.has(t.recommendationId));
  const ticketIds = new Set(tickets.map((t) => t.id));
  // Audit is limited to events on records the user can see, plus their own actions that do not target another
  // owner's recommendation or ticket (an earlier action on a since-reassigned record must not reveal it).
  const allRecIds = new Set(ds.recommendations.map((r) => r.id));
  const allTicketIds = new Set(ds.tickets.map((t) => t.id));
  const audit = ds.audit.filter(
    (e) => visible.has(e.target) || ticketIds.has(e.target) || (e.actorId === user.id && !allRecIds.has(e.target) && !allTicketIds.has(e.target)),
  );
  const anomalies = ds.anomalies.filter((a) => a.ownerId === user.id);
  const scoped: Dataset = { ...ds, recommendations, tickets, audit, anomalies };
  byUser.set(user.id, scoped);
  return scoped;
}

/** Looks up a recommendation within the user's scope. Out-of-scope and missing records are indistinguishable. */
export function findVisibleRec(ds: Dataset, user: User, id: string) {
  const rec = ds.recommendations.find((r) => r.id === id);
  return rec && canViewRec(user, rec) ? rec : undefined;
}
