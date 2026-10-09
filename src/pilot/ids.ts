import { createHash, randomUUID } from "node:crypto";
/** Stable key for long Azure identifiers (resource IDs can exceed index key limits). Case-insensitive, as ARM IDs are. */
export const sourceKey = (id: string) => createHash("sha256").update(id.trim().toLowerCase()).digest("hex");
export const newId = () => randomUUID();
export const nowIso = () => new Date().toISOString();
