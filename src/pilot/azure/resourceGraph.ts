// Azure Resource Graph inventory connector (read-only).
// API: POST https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2024-04-01
// Paged with options.$top (max 1000) and $skipToken. Queries are always pinned to ONE approved subscription.
import { z } from "zod";
import { sourceKey } from "../ids";
import { ConnectorError, type ArmClient } from "./arm";

export const RESOURCE_GRAPH_API = "2024-04-01";
const PATH = `/providers/Microsoft.ResourceGraph/resources?api-version=${RESOURCE_GRAPH_API}`;
const PAGE = 1000;

export const INVENTORY_QUERY =
  "Resources | project id, name, type, location, resourceGroup, subscriptionId, kind, skuName = tostring(sku.name), tags | order by id asc";
const VISIBILITY_QUERY = "ResourceContainers | where type =~ 'microsoft.resources/subscriptions' | project subscriptionId";

const Row = z.object({
  id: z.string().min(1).max(2048).startsWith("/subscriptions/"),
  name: z.string().min(1).max(260),
  type: z.string().min(1).max(260),
  location: z.string().max(64).nullish(),
  resourceGroup: z.string().max(128).nullish(),
  subscriptionId: z.string().regex(/^[0-9a-f-]{36}$/i),
  kind: z.string().max(128).nullish(),
  skuName: z.string().max(128).nullish(),
  tags: z.record(z.string(), z.unknown()).nullish(),
});

export interface InventoryResource {
  resourceKey: string;
  resourceId: string;
  subscriptionId: string;
  resourceGroup: string | null;
  name: string;
  type: string;
  location: string | null;
  kind: string | null;
  skuName: string | null;
  tags: Record<string, string>;
}

/** Pure: validates and normalizes one Resource Graph row; returns null for rows that fail validation. */
export function normalizeResource(row: unknown): InventoryResource | null {
  const r = Row.safeParse(row);
  if (!r.success) return null;
  const v = r.data;
  const tags: Record<string, string> = {};
  for (const [k, val] of Object.entries(v.tags ?? {}).slice(0, 100)) if (typeof val === "string") tags[k.slice(0, 512)] = val.slice(0, 256);
  return {
    resourceKey: sourceKey(v.id),
    resourceId: v.id,
    subscriptionId: v.subscriptionId.toLowerCase(),
    resourceGroup: v.resourceGroup || null,
    name: v.name,
    type: v.type.toLowerCase(),
    location: v.location || null,
    kind: v.kind || null,
    skuName: v.skuName || null,
    tags,
  };
}

interface GraphResponse {
  data?: unknown;
  $skipToken?: string;
  resultTruncated?: string | boolean;
  totalRecords?: number;
}

/** True when the application identity can see the subscription. Resource Graph returns an empty result (not 403) otherwise. */
export async function subscriptionVisible(client: ArmClient, subscriptionId: string, signal?: AbortSignal): Promise<boolean> {
  const r = await client.request<GraphResponse>("POST", PATH, { subscriptions: [subscriptionId], query: VISIBILITY_QUERY, options: { resultFormat: "objectArray", $top: 10 } }, signal);
  const data = Array.isArray(r.data) ? (r.data as { subscriptionId?: string }[]) : [];
  return data.some((d) => d.subscriptionId?.toLowerCase() === subscriptionId.toLowerCase());
}

export interface InventoryPage {
  resources: InventoryResource[];
  rejected: number;
}

/**
 * Streams inventory pages for one subscription. Throws ConnectorError("limit_exceeded") when maxResources would be
 * exceeded, so the caller records a partial run instead of silently truncating.
 */
export async function* inventoryPages(client: ArmClient, subscriptionId: string, maxResources: number, signal?: AbortSignal): AsyncGenerator<InventoryPage> {
  let skipToken: string | undefined;
  let seen = 0;
  for (let page = 0; page < 1000; page++) {
    const options: Record<string, unknown> = { resultFormat: "objectArray" };
    if (skipToken) options.$skipToken = skipToken;
    else options.$top = PAGE;
    const r = await client.request<GraphResponse>("POST", PATH, { subscriptions: [subscriptionId], query: INVENTORY_QUERY, options }, signal);
    if (!Array.isArray(r.data)) throw new ConnectorError("invalid_response", "Resource Graph response did not contain a data array");
    if (r.resultTruncated === true || r.resultTruncated === "true") throw new ConnectorError("invalid_response", "Resource Graph reported a truncated result");
    const resources: InventoryResource[] = [];
    let rejected = 0;
    for (const row of r.data) {
      const n = normalizeResource(row);
      if (!n) rejected++;
      else if (n.subscriptionId !== subscriptionId.toLowerCase()) rejected++; // never accept rows outside the approved scope
      else resources.push(n);
    }
    seen += resources.length;
    if (seen > maxResources) throw new ConnectorError("limit_exceeded", `Inventory exceeds the configured limit of ${maxResources} resources`);
    yield { resources, rejected };
    skipToken = r.$skipToken || undefined;
    if (!skipToken) return;
  }
  throw new ConnectorError("limit_exceeded", "Resource Graph pagination did not terminate");
}
