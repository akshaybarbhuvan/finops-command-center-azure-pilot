// Deterministic synthetic dataset generator. One seed => one dataset, byte-for-byte, on server and client.
// Every figure displayed in the application is derived from the records produced here.
import { createRng, hash, round, type Rng } from "./prng";
import {
  APPLICATIONS,
  AS_OF,
  BUSINESS_UNITS,
  CURRENT_MONTH,
  DAY_OF_MONTH,
  DEMO_SEED,
  REGIONS,
  SLA_DAYS,
  SUBSCRIPTION_SEEDS,
  TEAMS,
  USERS,
} from "./org";
import { LIFECYCLE, TICKET_STATUS_FOR_STAGE } from "./workflow";
import type {
  Anomaly,
  Comment,
  CostCategory,
  DailyCostRow,
  Dataset,
  Environment,
  GovernanceIssue,
  MonthlyCostRow,
  PolicyException,
  Priority,
  RecCategory,
  Recommendation,
  Reservation,
  Resource,
  Risk,
  Stage,
  StageEvent,
  Subscription,
  Ticket,
} from "./types";

/** Target monthly run-rate for the illustrative tenant (USD). */
export const TARGET_MONTHLY_RUN_RATE = 12_400_000;

// ---------------------------------------------------------------------------
// Date helpers (UTC, string based — no clock dependency)
// ---------------------------------------------------------------------------
const DAY = 86_400_000;
export const toDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => isoDay(new Date(toDate(iso).getTime() + days * DAY));
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);

export const HISTORY_MONTHS = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
export const FORECAST_MONTHS = [CURRENT_MONTH, "2026-11", "2026-12"];
const DAYS_IN: Record<string, number> = { "2025-11": 30, "2025-12": 31, "2026-01": 31, "2026-02": 28, "2026-03": 31, "2026-04": 30, "2026-05": 31, "2026-06": 30, "2026-07": 31, "2026-08": 31, "2026-09": 30, "2026-10": 31, "2026-11": 30, "2026-12": 31 };
export const daysInMonth = (m: string) => DAYS_IN[m] ?? 30;

// ---------------------------------------------------------------------------
// Resource templates
// ---------------------------------------------------------------------------
type UtilProfile = "compute" | "steady" | "storage" | "none";
interface Template {
  key: string;
  type: string;
  service: string;
  category: CostCategory;
  skus: string[];
  cost: [number, number, number?];
  count: number;
  prefix: string;
  subs?: string[];
  util: UtilProfile;
  instances?: [number, number];
}

const T: Template[] = [
  { key: "vm", type: "Virtual Machine", service: "Virtual Machines", category: "Compute", skus: ["Standard_D8s_v5", "Standard_D16s_v5", "Standard_E16s_v5", "Standard_D8s_v3", "Standard_E32s_v3", "Standard_F16s_v2", "Standard_D4s_v5", "Standard_E8s_v5"], cost: [380, 14000, 2.4], count: 820, prefix: "vm", util: "compute" },
  { key: "vmss", type: "VM Scale Set", service: "Virtual Machine Scale Sets", category: "Compute", skus: ["Standard_HB120rs_v3", "Standard_HC44rs", "Standard_F72s_v2", "Standard_D64s_v5"], cost: [16000, 90000, 2], count: 38, prefix: "vmss", subs: ["sub-eng-prod", "sub-eng-dev", "sub-com-prod", "sub-erp-prod"], util: "compute", instances: [4, 48] },
  { key: "aks", type: "AKS Node Pool", service: "Azure Kubernetes Service", category: "Compute", skus: ["Standard_D16s_v5", "Standard_E16s_v5", "Standard_D32s_v5", "Standard_NC24ads_A100_v4"], cost: [3800, 42000, 2], count: 110, prefix: "aks-np", subs: ["sub-com-prod", "sub-com-stage", "sub-data-prod", "sub-ml-prod", "sub-eng-dev", "sub-mgmt", "sub-corp-prod"], util: "compute", instances: [3, 40] },
  { key: "asp", type: "App Service Plan", service: "App Service", category: "Compute", skus: ["P1v3", "P2v3", "P3v3", "I2v2"], cost: [280, 6200, 2.2], count: 150, prefix: "asp", util: "compute", instances: [1, 10] },
  { key: "sqldb", type: "SQL Database", service: "Azure SQL Database", category: "Database", skus: ["GP_Gen5_8", "BC_Gen5_16", "GP_Gen5_4", "HS_Gen5_8", "GP_Gen5_16"], cost: [900, 22000, 2.3], count: 170, prefix: "sqldb", util: "steady" },
  { key: "sqlmi", type: "SQL Managed Instance", service: "Azure SQL Managed Instance", category: "Database", skus: ["BC_Gen5_32", "GP_Gen5_16", "BC_Gen5_24"], cost: [8000, 38000, 1.8], count: 18, prefix: "sqlmi", subs: ["sub-erp-prod", "sub-erp-nonprod", "sub-corp-prod", "sub-data-prod"], util: "steady" },
  { key: "cosmos", type: "Cosmos DB Account", service: "Azure Cosmos DB", category: "Database", skus: ["Provisioned throughput", "Autoscale throughput"], cost: [1500, 28000, 2.2], count: 40, prefix: "cosmos", subs: ["sub-com-prod", "sub-com-stage", "sub-data-prod", "sub-ml-prod"], util: "steady" },
  { key: "pg", type: "PostgreSQL Flexible Server", service: "Azure Database for PostgreSQL", category: "Database", skus: ["GP_D8ds_v5", "GP_D16ds_v5", "MO_E16ds_v5"], cost: [400, 6200, 2], count: 60, prefix: "pg", util: "steady" },
  { key: "st", type: "Storage Account", service: "Storage", category: "Storage", skus: ["StorageV2 (Hot)"], cost: [90, 19000, 3.2], count: 380, prefix: "st", util: "storage" },
  { key: "disk", type: "Managed Disk", service: "Managed Disks", category: "Storage", skus: ["Premium SSD P30", "Premium SSD P40", "Premium SSD P50", "Standard SSD E30", "Premium SSD P20"], cost: [60, 1300, 1.6], count: 300, prefix: "disk", util: "storage" },
  { key: "snap", type: "Disk Snapshot", service: "Managed Disks", category: "Storage", skus: ["Snapshot (Standard HDD)", "Snapshot (Premium)"], cost: [40, 950, 2], count: 150, prefix: "snap", util: "none" },
  { key: "agw", type: "Application Gateway", service: "Application Gateway", category: "Network", skus: ["WAF_v2", "Standard_v2"], cost: [600, 4200, 1.5], count: 40, prefix: "agw", util: "steady" },
  { key: "afw", type: "Azure Firewall", service: "Azure Firewall", category: "Network", skus: ["Premium", "Standard"], cost: [2800, 9800, 1.4], count: 10, prefix: "afw", subs: ["sub-hub", "sub-sec"], util: "steady" },
  { key: "er", type: "ExpressRoute Circuit", service: "ExpressRoute", category: "Network", skus: ["Premium 10 Gbps", "Standard 10 Gbps"], cost: [6000, 22000, 1.2], count: 6, prefix: "er", subs: ["sub-hub"], util: "steady" },
  { key: "egress", type: "Data Transfer", service: "Bandwidth", category: "Network", skus: ["Inter-region & internet egress"], cost: [1200, 26000, 2], count: 14, prefix: "bw", util: "none" },
  { key: "pip", type: "Public IP Address", service: "Virtual Network", category: "Network", skus: ["Standard static"], cost: [40, 120, 1], count: 80, prefix: "pip", util: "none" },
  { key: "nat", type: "NAT Gateway", service: "Virtual Network", category: "Network", skus: ["Standard"], cost: [60, 900, 1.6], count: 30, prefix: "ng", util: "steady" },
  { key: "dbx", type: "Databricks Workspace", service: "Azure Databricks", category: "Analytics & AI", skus: ["Premium"], cost: [15000, 160000, 2.2], count: 26, prefix: "dbw", subs: ["sub-data-prod", "sub-data-dev", "sub-ml-prod", "sub-eng-dev"], util: "compute" },
  { key: "syn", type: "Synapse SQL Pool", service: "Azure Synapse Analytics", category: "Analytics & AI", skus: ["DW1000c", "DW1500c", "DW3000c"], cost: [9000, 52000, 1.6], count: 10, prefix: "synp", subs: ["sub-data-prod", "sub-data-dev"], util: "steady" },
  { key: "adf", type: "Data Factory", service: "Azure Data Factory", category: "Analytics & AI", skus: ["Pipelines & data flows"], cost: [800, 9000, 2], count: 20, prefix: "adf", subs: ["sub-data-prod", "sub-data-dev", "sub-erp-prod", "sub-corp-prod"], util: "none" },
  { key: "aoai", type: "Azure OpenAI", service: "Azure OpenAI Service", category: "Analytics & AI", skus: ["Provisioned throughput (PTU)", "Standard (pay-as-you-go)"], cost: [12000, 70000, 1.6], count: 8, prefix: "aoai", subs: ["sub-ml-prod", "sub-com-prod"], util: "steady" },
  { key: "mlc", type: "ML Compute Cluster", service: "Azure Machine Learning", category: "Analytics & AI", skus: ["Standard_NC24ads_A100_v4", "Standard_NC48ads_A100_v4"], cost: [6000, 48000, 1.8], count: 22, prefix: "mlc", subs: ["sub-ml-prod", "sub-data-dev"], util: "compute" },
  { key: "law", type: "Log Analytics Workspace", service: "Azure Monitor", category: "Management & Security", skus: ["Pay-as-you-go", "Commitment tier 500 GB/day"], cost: [1500, 38000, 2.4], count: 30, prefix: "law", util: "none" },
  { key: "def", type: "Defender Plan", service: "Microsoft Defender for Cloud", category: "Management & Security", skus: ["Defender for Servers P2", "Defender CSPM"], cost: [2000, 16000, 1.6], count: 14, prefix: "def", util: "none" },
  { key: "kv", type: "Key Vault", service: "Key Vault", category: "Management & Security", skus: ["Premium (HSM)", "Standard"], cost: [10, 140, 1.5], count: 60, prefix: "kv", util: "none" },
];

const ENV_SHORT: Record<Environment, string> = { Production: "prd", Staging: "stg", Development: "dev", Test: "tst", Shared: "shr" };
const REGION_SHORT: Record<string, string> = { "East US 2": "eus2", "West US 3": "wus3", "Central US": "cus", "North Europe": "neu", "West Europe": "weu", "Southeast Asia": "sea" };
const APP_SHORT: Record<string, string> = {
  "app-s4": "s4h", "app-bw": "bw", "app-scp": "scp", "app-dvg": "dvg", "app-bfarm": "bfarm", "app-fwci": "fwci", "app-lake": "lake", "app-awb": "awb",
  "app-mlt": "mlt", "app-assist": "assist", "app-portal": "portal", "app-support": "support", "app-catalog": "catalog", "app-close": "close",
  "app-hr": "hr", "app-collab": "collab", "app-hub": "hub", "app-obs": "obs", "app-secops": "secops",
};

function guid(rng: Rng) {
  const h = () => Math.floor(rng.next() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
}

function utilization(rng: Rng, profile: UtilProfile, env: Environment): [number, number] {
  if (profile === "none") return [0, 0];
  if (profile === "storage") {
    const v = rng.range(18, 92);
    return [round(v, 1), round(Math.min(100, v + rng.range(2, 8)), 1)];
  }
  const nonProd = env !== "Production" && env !== "Shared";
  const band = rng.weighted<"idle" | "low" | "mid" | "high">([
    ["idle", nonProd ? 0.1 : 0.035],
    ["low", nonProd ? 0.3 : 0.17],
    ["mid", 0.42],
    ["high", nonProd ? 0.18 : 0.375],
  ]);
  const avg = band === "idle" ? rng.range(0.6, 3.8) : band === "low" ? rng.range(5, 16) : band === "mid" ? rng.range(20, 52) : rng.range(55, 82);
  const p95 = Math.min(99, avg * (profile === "steady" ? 1.35 : 1.7) + rng.range(2, 9));
  return [round(avg, 1), round(p95, 1)];
}

// ---------------------------------------------------------------------------
// Resource generation
// ---------------------------------------------------------------------------
function generateResources(rng: Rng): Resource[] {
  const out: Resource[] = [];
  let n = 0;
  for (const t of T) {
    const subs = SUBSCRIPTION_SEEDS.filter((s) => !t.subs || t.subs.includes(s.id));
    const subWeights = subs.map((s) => [s, s.weight] as const);
    for (let i = 0; i < t.count; i++) {
      n++;
      const sub = rng.weighted(subWeights);
      const appId = rng.pick(sub.apps);
      const app = APPLICATIONS.find((a) => a.id === appId)!;
      const region = rng.weighted(REGIONS.map((r, idx) => [r, [5, 2.2, 1.6, 1.4, 1.1, 0.7][idx]] as const));
      const sku = rng.pick(t.skus);
      const [uAvg, uP95] = utilization(rng, t.util, sub.environment);
      // Most of the estate pre-dates the reporting window; ~10% was provisioned during the last year.
      const ageDays = t.key === "snap" ? rng.int(10, 520) : rng.chance(0.1) ? rng.int(14, 360) : rng.int(380, 1400);
      const createdDate = addDays(AS_OF, -ageDays);
      const nonProd = sub.environment !== "Production" && sub.environment !== "Shared";
      let state: Resource["state"] = t.util === "compute" ? "Running" : "Active";
      if (t.key === "vm" && rng.chance(nonProd ? 0.09 : 0.03)) state = "Deallocated";
      if (t.key === "disk" && rng.chance(0.15)) state = "Unattached";
      if (t.key === "pip" && rng.chance(0.3)) state = "Unattached";
      if ((t.key === "agw" || t.key === "nat") && uAvg < 4) state = "Idle";
      let monthlyCost = rng.skew(t.cost[0], t.cost[1], t.cost[2] ?? 2);
      if (state === "Deallocated") monthlyCost *= rng.range(0.08, 0.16); // residual disk cost only
      const redundancy =
        t.key === "st" ? rng.weighted<"LRS" | "ZRS" | "GRS" | "RA-GRS">([["LRS", 4], ["ZRS", 2], ["GRS", nonProd ? 3 : 2.2], ["RA-GRS", 1]]) : undefined;
      const instanceCount = t.instances ? rng.int(t.instances[0], t.instances[1]) : 1;
      const ownerMissing = rng.chance(sub.environment === "Test" ? 0.22 : nonProd ? 0.1 : 0.045);
      const ccMissing = rng.chance(sub.environment === "Test" ? 0.2 : nonProd ? 0.09 : 0.04);
      const teamMembers = USERS.filter((u) => u.teamId === app.teamId && u.role === "engineering");
      out.push({
        id: `res-${String(n).padStart(5, "0")}`,
        name:
          t.key === "st"
            ? `st${APP_SHORT[appId]}${ENV_SHORT[sub.environment]}${REGION_SHORT[region]}${String(rng.int(1, 99)).padStart(2, "0")}`
            : `${t.prefix}-${APP_SHORT[appId]}-${ENV_SHORT[sub.environment]}-${REGION_SHORT[region]}-${String(rng.int(1, 99)).padStart(2, "0")}`,
        type: t.type,
        service: t.service,
        category: t.category,
        sku: t.key === "st" ? `StorageV2 ${redundancy}` : sku,
        subscriptionId: sub.id,
        resourceGroup: `rg-${APP_SHORT[appId]}-${ENV_SHORT[sub.environment]}-${REGION_SHORT[region]}`,
        region,
        environment: sub.environment,
        applicationId: appId,
        ownerId: ownerMissing ? null : rng.pick(teamMembers.length ? teamMembers : USERS.filter((u) => u.id === sub.ownerId)).id,
        costCenter: ccMissing ? null : BUSINESS_UNITS.find((b) => b.id === sub.businessUnitId)!.costCenter,
        monthlyCost,
        utilization: uAvg,
        utilizationP95: uP95,
        state,
        createdDate,
        ageDays,
        instanceCount,
        redundancy,
        governanceIssues: [],
      });
    }
  }
  // Make names unique and deterministic.
  const seen = new Map<string, number>();
  for (const r of out) {
    const c = (seen.get(r.name) ?? 0) + 1;
    seen.set(r.name, c);
    if (c > 1) r.name = `${r.name}${String.fromCharCode(96 + Math.min(c, 26))}`;
  }
  return out;
}

/** The hero resource used in the guided demo story. */
function heroResource(): Resource {
  return {
    id: "res-hero-01",
    name: "vmss-s4h-hana-prd-eus2",
    type: "VM Scale Set",
    service: "Virtual Machine Scale Sets",
    category: "Compute",
    sku: "Standard_M208ms_v2",
    subscriptionId: "sub-erp-prod",
    resourceGroup: "rg-s4h-prd-eus2",
    region: "East US 2",
    environment: "Production",
    applicationId: "app-s4",
    ownerId: "u-priya",
    costCenter: "CC-1100",
    monthlyCost: 214_800,
    utilization: 22.6,
    utilizationP95: 38.4,
    state: "Running",
    createdDate: "2024-03-18",
    ageDays: daysBetween("2024-03-18", AS_OF),
    instanceCount: 6,
    governanceIssues: [],
  };
}

function assignGovernance(r: Resource): GovernanceIssue[] {
  const issues: GovernanceIssue[] = [];
  if (!r.ownerId) issues.push("missing_owner");
  if (!r.costCenter) issues.push("missing_cost_center");
  const computeLike = r.category === "Compute" || r.category === "Database" || r.type === "Application Gateway" || r.type === "NAT Gateway" || r.type === "ML Compute Cluster";
  if (computeLike && r.state !== "Deallocated" && r.utilization > 0 && r.utilization < 4) issues.push("idle");
  if (r.type === "Disk Snapshot" && r.ageDays > 180) issues.push("aged_snapshot");
  if (r.state === "Unattached" || r.state === "Deallocated" || (r.state === "Idle" && r.category === "Network")) issues.push("orphaned");
  if (/_v3$|s_v3$/.test(r.sku) && r.type === "Virtual Machine") issues.push("legacy_sku");
  if (r.type === "Storage Account" && (r.redundancy === "GRS" || r.redundancy === "RA-GRS") && r.environment !== "Production" && r.environment !== "Shared") issues.push("nonprod_geo_redundancy");
  return issues;
}

// ---------------------------------------------------------------------------
// Recommendation rules
// ---------------------------------------------------------------------------
interface RecDraft {
  title: string;
  category: RecCategory;
  type: string;
  savingsPct: number;
  confidence: number;
  risk: Risk;
  effort: Recommendation["effort"];
  rationale: string;
  technicalImpact: string;
  remediation: string[];
  current: { label: string; value: string }[];
  proposed: { label: string; value: string }[];
}

const DOWNSIZE: Record<string, string> = {
  Standard_D16s_v5: "Standard_D8s_v5",
  Standard_D8s_v5: "Standard_D4s_v5",
  Standard_D4s_v5: "Standard_D2s_v5",
  Standard_E16s_v5: "Standard_E8s_v5",
  Standard_E8s_v5: "Standard_E4s_v5",
  Standard_D8s_v3: "Standard_D4s_v5",
  Standard_E32s_v3: "Standard_E16s_v5",
  Standard_F16s_v2: "Standard_F8s_v2",
  Standard_D64s_v5: "Standard_D32s_v5",
  Standard_F72s_v2: "Standard_F48s_v2",
  Standard_HB120rs_v3: "Standard_HB120-64rs_v3",
  Standard_HC44rs: "Standard_HC44-24rs",
  Standard_D32s_v5: "Standard_D16s_v5",
  Standard_NC24ads_A100_v4: "Standard_NC24ads_A100_v4 (autoscale 0-min)",
  GP_Gen5_8: "GP_Gen5_4",
  BC_Gen5_16: "BC_Gen5_8",
  GP_Gen5_4: "GP_Gen5_2",
  HS_Gen5_8: "HS_Gen5_4",
  GP_Gen5_16: "GP_Gen5_8",
  BC_Gen5_32: "BC_Gen5_16",
  GP_Gen5_16_mi: "GP_Gen5_8",
  BC_Gen5_24: "BC_Gen5_16",
  GP_D8ds_v5: "GP_D4ds_v5",
  GP_D16ds_v5: "GP_D8ds_v5",
  MO_E16ds_v5: "MO_E8ds_v5",
  P1v3: "P0v3",
  P2v3: "P1v3",
  P3v3: "P2v3",
  I2v2: "I1v2",
};

const pctStr = (n: number) => `${n.toFixed(1)}%`;

function ruleFor(r: Resource, rng: Rng): RecDraft | null {
  const nonProd = r.environment !== "Production" && r.environment !== "Shared";
  const util = [
    { label: "CPU avg (30d)", value: pctStr(r.utilization) },
    { label: "CPU p95 (30d)", value: pctStr(r.utilizationP95) },
  ];
  const base = { current: [{ label: "SKU", value: r.sku }, ...(r.instanceCount > 1 ? [{ label: "Instances", value: String(r.instanceCount) }] : []), ...util] };

  switch (r.type) {
    case "Virtual Machine": {
      if (r.state === "Deallocated")
        return { title: `Delete deallocated VM ${r.name} and release disks`, category: "Compute", type: "Remove deallocated VM", savingsPct: 1, confidence: 92, risk: "Low", effort: "Low", rationale: `VM has been deallocated and is accruing managed-disk cost with no compute activity.`, technicalImpact: "Snapshot disks before deletion; confirm no restore dependency.", remediation: ["Confirm with owner that the workload is retired", "Snapshot OS/data disks to Cool storage (30-day retention)", "Delete VM, NICs and disks"], current: [{ label: "Power state", value: "Deallocated" }, { label: "SKU", value: r.sku }], proposed: [{ label: "Resource", value: "Removed (snapshot retained 30 days)" }] };
      if (r.utilization < 4)
        return { title: `Deallocate idle VM ${r.name}`, category: "Compute", type: "Idle VM", savingsPct: rng.range(0.82, 0.92), confidence: 88, risk: nonProd ? "Low" : "Medium", effort: "Low", rationale: `Average CPU of ${pctStr(r.utilization)} over 30 days with negligible network I/O indicates the VM is idle.`, technicalImpact: "Workload unavailable until restarted; disks retained.", remediation: ["Validate idle status with application owner", "Deallocate VM and tag with decommission date", "Delete after 30-day observation window"], ...base, proposed: [{ label: "Power state", value: "Deallocated" }] };
      if (r.utilizationP95 < 30 && DOWNSIZE[r.sku])
        return { title: `Rightsize ${r.name} from ${r.sku.replace("Standard_", "")} to ${DOWNSIZE[r.sku].replace("Standard_", "")}`, category: "Compute", type: "Rightsize VM", savingsPct: rng.range(0.42, 0.5), confidence: Math.round(rng.range(80, 93)), risk: nonProd ? "Low" : "Medium", effort: "Low", rationale: `p95 CPU of ${pctStr(r.utilizationP95)} leaves substantial headroom; the next smaller SKU retains >2x peak capacity.`, technicalImpact: "Requires a VM restart during a maintenance window.", remediation: ["Schedule maintenance window with application owner", `Resize to ${DOWNSIZE[r.sku]}`, "Monitor p95 CPU and memory for 14 days"], ...base, proposed: [{ label: "SKU", value: DOWNSIZE[r.sku] }, { label: "Projected p95 CPU", value: pctStr(Math.min(85, r.utilizationP95 * 2)) }] };
      if (nonProd && rng.chance(0.42))
        return { title: `Apply off-hours schedule to ${r.name}`, category: "Compute", type: "Auto-shutdown schedule", savingsPct: rng.range(0.55, 0.64), confidence: 90, risk: "Low", effort: "Low", rationale: `Non-production VM runs 24x7; activity is concentrated in business hours (Mon–Fri, 07:00–19:00).`, technicalImpact: "VM unavailable nights and weekends unless started on demand.", remediation: ["Apply start/stop schedule (Mon–Fri 07:00–19:00)", "Publish self-service start runbook", "Review exceptions monthly"], ...base, proposed: [{ label: "Running hours / week", value: "60 (from 168)" }] };
      if (r.sku.endsWith("_v3") && rng.chance(0.45))
        return { title: `Modernize ${r.name} from ${r.sku.replace("Standard_", "")} to v5 generation`, category: "Compute", type: "SKU modernization", savingsPct: rng.range(0.12, 0.19), confidence: 84, risk: "Medium", effort: "Medium", rationale: `v3-generation SKUs carry a price-performance penalty versus v5 equivalents in ${r.region}.`, technicalImpact: "Requires restart; validate driver and image compatibility.", remediation: ["Validate image compatibility with v5 hardware", "Resize during maintenance window", "Update IaC module defaults"], ...base, proposed: [{ label: "SKU", value: r.sku.replace("_v3", "_v5") }] };
      return null;
    }
    case "VM Scale Set":
    case "AKS Node Pool": {
      if (r.utilizationP95 < 40)
        return { title: r.type === "AKS Node Pool" ? `Rightsize AKS node pool ${r.name} and enable cluster autoscaler` : `Rightsize scale set ${r.name} and add scale-in schedule`, category: "Compute", type: r.type === "AKS Node Pool" ? "Rightsize node pool" : "Rightsize scale set", savingsPct: rng.range(0.24, 0.38), confidence: Math.round(rng.range(78, 90)), risk: "Medium", effort: "Medium", rationale: `${r.instanceCount} instances average ${pctStr(r.utilization)} CPU (p95 ${pctStr(r.utilizationP95)}); capacity can track demand.`, technicalImpact: "Pod/instance rescheduling; validate PodDisruptionBudgets and peak headroom.", remediation: ["Enable autoscaler with min/max bounds from 30-day profile", "Reduce baseline instance count", "Validate SLOs through one peak cycle"], ...base, proposed: [{ label: "Baseline instances", value: String(Math.max(2, Math.round(r.instanceCount * 0.6))) }, { label: "Autoscale", value: "Enabled" }] };
      return null;
    }
    case "App Service Plan":
      if (r.utilizationP95 < 28)
        return { title: `Downsize App Service plan ${r.name} (${r.sku} → ${DOWNSIZE[r.sku] ?? r.sku})`, category: "Compute", type: "Rightsize App Service", savingsPct: rng.range(0.35, 0.48), confidence: 86, risk: "Low", effort: "Low", rationale: `Plan p95 CPU ${pctStr(r.utilizationP95)} across ${r.instanceCount} instance(s).`, technicalImpact: "Zero-downtime scale-down for most apps.", remediation: ["Scale plan down one tier", "Consolidate low-traffic apps onto shared plan", "Monitor response time for 7 days"], ...base, proposed: [{ label: "Tier", value: DOWNSIZE[r.sku] ?? r.sku }] };
      return null;
    case "SQL Database":
    case "SQL Managed Instance":
    case "PostgreSQL Flexible Server": {
      const cur = [{ label: "Service objective", value: r.sku }, { label: "vCore utilization avg", value: pctStr(r.utilization) }, { label: "vCore utilization p95", value: pctStr(r.utilizationP95) }];
      if (nonProd && r.type === "SQL Database" && r.utilization < 20)
        return { title: `Move ${r.name} to serverless compute tier`, category: "Database", type: "Serverless database", savingsPct: rng.range(0.42, 0.6), confidence: 85, risk: "Low", effort: "Low", rationale: `Intermittent non-production usage (${pctStr(r.utilization)} avg) suits auto-pause serverless billing.`, technicalImpact: "First connection after auto-pause incurs warm-up latency.", remediation: ["Switch to General Purpose serverless", "Set auto-pause delay to 60 minutes", "Notify test teams of warm-up behaviour"], current: cur, proposed: [{ label: "Tier", value: "GP Serverless (auto-pause 60m)" }] };
      if (r.utilizationP95 < 35)
        return { title: `Rightsize ${r.name} (${r.sku} → ${DOWNSIZE[r.sku] ?? "lower tier"})`, category: "Database", type: "Rightsize database", savingsPct: rng.range(0.3, 0.44), confidence: Math.round(rng.range(78, 90)), risk: r.environment === "Production" ? "Medium" : "Low", effort: "Medium", rationale: `p95 vCore utilization of ${pctStr(r.utilizationP95)} indicates over-provisioned compute.`, technicalImpact: "Brief failover during scale operation.", remediation: ["Scale down during low-traffic window", "Validate query performance baselines", "Review again after month-end close"], current: cur, proposed: [{ label: "Service objective", value: DOWNSIZE[r.sku] ?? "One tier lower" }] };
      return null;
    }
    case "Cosmos DB Account":
      if (r.utilizationP95 < 40)
        return { title: `Enable autoscale throughput on ${r.name}`, category: "Database", type: "Cosmos autoscale", savingsPct: rng.range(0.26, 0.42), confidence: 82, risk: "Low", effort: "Low", rationale: `Provisioned RU/s are consumed at ${pctStr(r.utilization)} on average; autoscale bills for actual peaks.`, technicalImpact: "No downtime; set max RU/s from observed peak.", remediation: ["Convert containers to autoscale", "Set max RU/s to observed p99 + 20%", "Review throttling metrics weekly"], current: [{ label: "Throughput mode", value: r.sku }, { label: "RU utilization avg", value: pctStr(r.utilization) }], proposed: [{ label: "Throughput mode", value: "Autoscale" }] };
      return null;
    case "Storage Account": {
      const cur = [{ label: "Replication", value: r.redundancy ?? "LRS" }, { label: "Access tier", value: "Hot" }, { label: "Environment", value: r.environment }];
      if (r.governanceIssues.includes("nonprod_geo_redundancy"))
        return { title: `Change ${r.name} replication from ${r.redundancy} to LRS (non-production)`, category: "Storage", type: "Replication downgrade", savingsPct: rng.range(0.38, 0.48), confidence: 91, risk: "Low", effort: "Low", rationale: `Geo-redundant replication is not required for ${r.environment.toLowerCase()} data under the storage standard.`, technicalImpact: "Data remains durable within region; no application change.", remediation: ["Confirm no DR requirement with data owner", "Change replication to LRS", "Update storage policy compliance record"], current: cur, proposed: [{ label: "Replication", value: "LRS" }] };
      if (r.monthlyCost > 1800 && rng.chance(0.5))
        return { title: `Apply lifecycle tiering policy to ${r.name}`, category: "Storage", type: "Lifecycle management", savingsPct: rng.range(0.24, 0.4), confidence: 80, risk: "Low", effort: "Low", rationale: `${Math.round(rng.range(55, 80))}% of blobs have not been accessed in 90+ days and remain in the Hot tier.`, technicalImpact: "Higher read latency/cost for archived blobs.", remediation: ["Apply lifecycle rule: Cool after 30 days, Archive after 180 days", "Exclude active prefixes", "Monitor rehydration requests"], current: cur, proposed: [{ label: "Access tier", value: "Hot → Cool (30d) → Archive (180d)" }] };
      return null;
    }
    case "Managed Disk":
      if (r.state === "Unattached")
        return { title: `Delete unattached disk ${r.name}`, category: "Storage", type: "Unattached disk", savingsPct: 1, confidence: 95, risk: "Low", effort: "Low", rationale: `Disk has not been attached to any VM for ${Math.round(rng.range(35, 220))} days.`, technicalImpact: "Snapshot retained before deletion.", remediation: ["Snapshot disk to Standard HDD", "Delete disk", "Remove snapshot after 30 days if unclaimed"], current: [{ label: "SKU", value: r.sku }, { label: "Attachment", value: "Unattached" }], proposed: [{ label: "Resource", value: "Deleted (snapshot retained)" }] };
      if (r.sku.startsWith("Premium") && r.utilizationP95 < 30 && rng.chance(0.35))
        return { title: `Downgrade ${r.name} from ${r.sku} to Standard SSD`, category: "Storage", type: "Disk tier downgrade", savingsPct: rng.range(0.4, 0.5), confidence: 80, risk: "Medium", effort: "Low", rationale: `IOPS consumption at p95 is ${pctStr(r.utilizationP95)} of provisioned performance.`, technicalImpact: "Lower IOPS ceiling; validate latency-sensitive workloads.", remediation: ["Validate IOPS profile", "Change disk SKU during maintenance window"], current: [{ label: "SKU", value: r.sku }, { label: "IOPS p95", value: pctStr(r.utilizationP95) }], proposed: [{ label: "SKU", value: "Standard SSD" }] };
      return null;
    case "Disk Snapshot":
      if (r.ageDays > 180)
        return { title: `Delete snapshot ${r.name} (${r.ageDays} days old)`, category: "Storage", type: "Aged snapshot", savingsPct: 1, confidence: 93, risk: "Low", effort: "Low", rationale: `Snapshot exceeds the 180-day retention standard and is not referenced by a backup policy.`, technicalImpact: "Point-in-time restore from this snapshot no longer possible.", remediation: ["Confirm no legal hold", "Delete snapshot", "Apply retention policy to source disk"], current: [{ label: "Age", value: `${r.ageDays} days` }, { label: "SKU", value: r.sku }], proposed: [{ label: "Resource", value: "Deleted" }] };
      return null;
    case "Application Gateway":
    case "NAT Gateway":
      if (r.state === "Idle")
        return { title: `Remove idle ${r.type} ${r.name}`, category: "Network", type: "Idle network resource", savingsPct: 1, confidence: 87, risk: "Low", effort: "Low", rationale: `No backend traffic processed in the last 30 days.`, technicalImpact: "Confirm DNS and listener references are removed.", remediation: ["Confirm no DNS/listener dependencies", "Remove resource via IaC", "Release associated public IP"], current: [{ label: "Throughput (30d avg)", value: "< 1 Mbps" }, { label: "SKU", value: r.sku }], proposed: [{ label: "Resource", value: "Removed" }] };
      return null;
    case "Public IP Address":
      if (r.state === "Unattached")
        return { title: `Release unattached public IP ${r.name}`, category: "Network", type: "Unattached public IP", savingsPct: 1, confidence: 96, risk: "Low", effort: "Low", rationale: "Static public IP is not associated with any NIC, load balancer or gateway.", technicalImpact: "None — address not in use.", remediation: ["Verify no allow-list references", "Delete public IP"], current: [{ label: "Association", value: "None" }], proposed: [{ label: "Resource", value: "Released" }] };
      return null;
    case "Data Transfer":
      if (rng.chance(0.4))
        return { title: `Reduce cross-region egress for ${r.resourceGroup}`, category: "Network", type: "Egress optimization", savingsPct: rng.range(0.18, 0.3), confidence: 72, risk: "Medium", effort: "High", rationale: "Repeated cross-region replication traffic between paired workloads.", technicalImpact: "Requires data-path redesign (regional caching or co-location).", remediation: ["Introduce regional read replica", "Enable CDN caching for static assets", "Re-measure egress after 30 days"], current: [{ label: "Pattern", value: "Inter-region replication" }], proposed: [{ label: "Pattern", value: "Regional caching / co-location" }] };
      return null;
    case "Databricks Workspace":
      if (rng.chance(0.65))
        return { title: `Enforce auto-termination and job clusters in ${r.name}`, category: "Compute", type: "Databricks cluster policy", savingsPct: rng.range(0.16, 0.28), confidence: 81, risk: "Low", effort: "Medium", rationale: `All-purpose clusters idle ${Math.round(rng.range(28, 46))}% of billed hours; scheduled workloads run on interactive clusters.`, technicalImpact: "Cluster policy change; scheduled jobs move to job clusters.", remediation: ["Apply cluster policy: auto-termination 30 min", "Migrate scheduled notebooks to job clusters", "Enable spot instances for non-critical jobs"], current: [{ label: "Idle billed hours", value: "≈ 35%" }, { label: "Cluster policy", value: "Not enforced" }], proposed: [{ label: "Cluster policy", value: "Auto-terminate 30m, job clusters" }] };
      return null;
    case "Synapse SQL Pool":
      if (r.utilization < 35)
        return { title: `Pause ${r.name} outside business hours`, category: "Database", type: "Pause dedicated pool", savingsPct: rng.range(0.44, 0.58), confidence: 86, risk: "Low", effort: "Low", rationale: `Query activity is concentrated in business hours; pool runs 24x7 at ${r.sku}.`, technicalImpact: "Queries outside schedule require on-demand resume.", remediation: ["Automate pause/resume (Mon–Fri 06:00–20:00)", "Notify report consumers"], current: [{ label: "Service level", value: r.sku }, { label: "Schedule", value: "24x7" }], proposed: [{ label: "Schedule", value: "Mon–Fri 06:00–20:00" }] };
      return null;
    case "ML Compute Cluster":
      if (r.utilization < 30)
        return { title: `Set minimum nodes to zero on ${r.name}`, category: "Compute", type: "Idle ML compute", savingsPct: rng.range(0.5, 0.68), confidence: 88, risk: "Low", effort: "Low", rationale: `GPU nodes idle ${Math.round(100 - r.utilization)}% of billed time between training runs.`, technicalImpact: "Cold-start latency of a few minutes for new jobs.", remediation: ["Set min nodes = 0, idle scale-down = 15 min", "Use low-priority VMs for experiments"], ...base, proposed: [{ label: "Min nodes", value: "0" }] };
      return null;
    case "Azure OpenAI":
      if (r.sku.startsWith("Provisioned") && r.utilization < 45)
        return { title: `Right-size provisioned throughput on ${r.name}`, category: "Other", type: "PTU rightsizing", savingsPct: rng.range(0.22, 0.34), confidence: 76, risk: "Medium", effort: "Medium", rationale: `Provisioned throughput utilization averages ${pctStr(r.utilization)}; spillover to standard deployment covers peaks.`, technicalImpact: "Requires spillover routing for peak traffic.", remediation: ["Reduce PTU allocation", "Configure spillover to standard deployment", "Monitor 429 rates"], current: [{ label: "Deployment", value: r.sku }, { label: "PTU utilization", value: pctStr(r.utilization) }], proposed: [{ label: "Deployment", value: "Reduced PTU + standard spillover" }] };
      return null;
    case "Log Analytics Workspace":
      if (rng.chance(0.55))
        return { title: `Reduce retention and move verbose tables to Basic logs in ${r.name}`, category: "Other", type: "Log retention", savingsPct: rng.range(0.2, 0.34), confidence: 83, risk: "Low", effort: "Low", rationale: "Verbose container and diagnostic tables are retained at analytics tier for 180 days.", technicalImpact: "Basic-log tables have limited query capability.", remediation: ["Move ContainerLog / AppTraces to Basic logs", "Set interactive retention to 30 days, archive to 1 year", "Review diagnostic settings"], current: [{ label: "Retention", value: "180 days (analytics)" }], proposed: [{ label: "Retention", value: "30 days + archive" }] };
      return null;
    default:
      return null;
  }
}

const STAGE_META_OPEN = new Set<Stage>(["identified", "validated", "assigned", "in_progress", "submitted", "approved", "implemented"]);

const BUSINESS_IMPACT: Record<RecCategory, string> = {
  Compute: "Reduces compute run-rate without changing service levels when executed in a maintenance window.",
  Storage: "Removes waste and aligns storage cost to data value and retention standards.",
  Database: "Aligns database capacity with observed demand; no functional change for users.",
  Network: "Eliminates unused network spend and reduces attack surface.",
  Commitments: "Converts predictable on-demand spend into discounted commitment pricing.",
  Other: "Aligns platform service consumption with actual demand.",
};

function priorityFor(annual: number): Priority {
  if (annual >= 250_000) return "Critical";
  if (annual >= 60_000) return "High";
  if (annual >= 12_000) return "Medium";
  return "Low";
}

const STAGE_WEIGHTS: (readonly [Stage, number])[] = [
  ["identified", 18],
  ["validated", 13],
  ["assigned", 12],
  ["in_progress", 11],
  ["submitted", 5],
  ["approved", 5],
  ["implemented", 5],
  ["verified", 4],
  ["closed", 12],
  ["rejected", 5],
  ["deferred", 3],
];
const STAGE_AGE: Record<Stage, [number, number]> = {
  identified: [1, 34],
  validated: [5, 42],
  assigned: [9, 55],
  in_progress: [14, 70],
  submitted: [18, 78],
  approved: [22, 84],
  implemented: [28, 96],
  verified: [55, 170],
  closed: [75, 265],
  rejected: [20, 200],
  deferred: [25, 150],
};

const COMMENT_TEMPLATES = [
  "Confirmed with the application owner — no dependency on the current configuration.",
  "Change window booked for the next maintenance cycle.",
  "Utilization profile reviewed for the last quarter; recommendation holds through month-end peaks.",
  "Raised with the architecture review board; no objections.",
  "Waiting on load-test results before proceeding.",
  "Savings estimate validated against the last two billing cycles.",
];

function stagePath(stage: Stage, rng: Rng): Stage[] {
  if (stage === "rejected") return rng.chance(0.5) ? ["identified", "validated", "rejected"] : ["identified", "validated", "assigned", "in_progress", "submitted", "rejected"];
  if (stage === "deferred") return rng.chance(0.5) ? ["identified", "validated", "deferred"] : ["identified", "validated", "assigned", "deferred"];
  return LIFECYCLE.slice(0, LIFECYCLE.indexOf(stage) + 1);
}

function actorFor(stage: Stage, ownerId: string | null, teamLead: string, rng: Rng): string {
  switch (stage) {
    case "identified":
      return "u-system";
    case "validated":
    case "verified":
    case "closed":
      return rng.chance(0.6) ? "u-finops2" : "u-finops";
    case "assigned":
      return rng.chance(0.7) ? "u-finops" : "u-exec";
    case "approved":
    case "rejected":
    case "deferred":
      return rng.chance(0.55) ? "u-finops" : rng.chance(0.5) ? "u-exec" : "u-cfo";
    default:
      return ownerId ?? teamLead;
  }
}

function buildRecommendations(rng: Rng, resources: Resource[]): Recommendation[] {
  const recs: Recommendation[] = [];
  let id = 1000;
  const appTeam = (appId: string) => APPLICATIONS.find((a) => a.id === appId)!.teamId;

  const make = (r: Resource, d: RecDraft, monthlyBase: number): Recommendation | null => {
    const monthlySavings = round(monthlyBase * d.savingsPct, 0);
    if (monthlySavings < 150) return null;
    id++;
    const annual = monthlySavings * 12;
    const priority = priorityFor(annual);
    const stage = rng.weighted(STAGE_WEIGHTS);
    const slaDays = SLA_DAYS[priority];
    const rawAge = rng.int(STAGE_AGE[stage][0], STAGE_AGE[stage][1]);
    // Most open work sits inside its SLA window; roughly one in ten items has slipped past it.
    const age = STAGE_META_OPEN.has(stage) ? Math.max(STAGE_AGE[stage][0], Math.min(rawAge, Math.round(slaDays * (rng.chance(0.1) ? rng.range(1.05, 1.6) : rng.range(0.15, 0.97))))) : rawAge;
    const createdDate = addDays(AS_OF, -age);
    const teamId = appTeam(r.applicationId);
    const team = TEAMS.find((t) => t.id === teamId)!;
    const members = USERS.filter((u) => u.teamId === teamId && u.role === "engineering");
    const path = stagePath(stage, rng);
    const ownerId = path.includes("assigned") ? rng.pick(members).id : null;
    // Spread stage events after creation; strictly increasing, never in the future.
    // Completed work typically finishes inside its SLA window (≈85% met).
    const done = stage === "verified" || stage === "closed";
    const span = Math.max(path.length, Math.min(age - 1, done ? Math.round(slaDays * (rng.chance(0.85) ? rng.range(0.55, 0.98) : rng.range(1.05, 1.4))) : age - 1));
    const history: StageEvent[] = path.map((s, i) => ({
      stage: s,
      at: addDays(createdDate, i === 0 ? 0 : Math.min(age - 1, Math.round((span * i) / (path.length - 1 || 1)))),
      byUserId: actorFor(s, ownerId, team.leadId, rng),
    }));
    for (let i = 1; i < history.length; i++) if (history[i].at < history[i - 1].at) history[i].at = history[i - 1].at;
    const decision = history.find((h) => h.stage === "approved" || h.stage === "rejected" || h.stage === "deferred");
    const verifiedAt = history.find((h) => h.stage === "verified")?.at ?? null;
    const comments: Comment[] = [];
    const nComments = rng.int(0, path.length > 3 ? 3 : 1);
    for (let i = 0; i < nComments; i++) {
      const h = history[Math.min(history.length - 1, i + 1)];
      comments.push({ id: `c-${id}-${i}`, authorId: h.byUserId === "u-system" ? "u-finops2" : h.byUserId, at: h.at, body: rng.pick(COMMENT_TEMPLATES), kind: "comment" });
    }
    return {
      id: `REC-${id}`,
      title: d.title,
      category: d.category,
      type: d.type,
      resourceId: r.id,
      subscriptionId: r.subscriptionId,
      resourceGroup: r.resourceGroup,
      teamId,
      ownerId,
      currentMonthlyCost: round(monthlyBase, 0),
      estimatedMonthlySavings: monthlySavings,
      confidence: d.confidence,
      priority,
      risk: d.risk,
      effort: d.effort,
      businessImpact: BUSINESS_IMPACT[d.category],
      technicalImpact: d.technicalImpact,
      rationale: d.rationale,
      remediation: d.remediation,
      evidence: [
        { label: "Resource", value: r.name },
        { label: "Observation window", value: "Trailing 30 days" },
        ...(r.utilization > 0 ? [{ label: "Avg utilization", value: pctStr(r.utilization) }, { label: "p95 utilization", value: pctStr(r.utilizationP95) }] : []),
        { label: "Monthly cost (run-rate)", value: `$${Math.round(monthlyBase).toLocaleString("en-US")}` },
        { label: "Detection rule", value: d.type },
      ],
      current: d.current,
      proposed: d.proposed,
      createdDate,
      dueDate: addDays(createdDate, slaDays),
      slaDays,
      stage,
      history,
      ticketId: null,
      comments,
      approval: decision
        ? { approverId: decision.byUserId, at: decision.at, decision: decision.stage === "approved" ? "approved" : decision.stage === "rejected" ? "rejected" : "deferred", note: decision.stage === "rejected" ? "Workload scheduled for re-platforming next quarter; change not justified." : decision.stage === "deferred" ? "Deferred until after the quarter-end change freeze." : "Approved — execute in the next maintenance window." }
        : null,
      realizedDate: verifiedAt,
      realizedMonthlySavings: verifiedAt ? Math.min(round(monthlyBase, 0), round(monthlySavings * rng.range(0.9, 1.03), 0)) : 0,
    };
  };

  for (const r of resources) {
    if (r.id === "res-hero-01") continue;
    const draft = ruleFor(r, rng);
    if (!draft) continue;
    const rec = make(r, draft, r.monthlyCost);
    if (rec) recs.push(rec);
  }

  // Commitment opportunities: steady-state production compute by family that is not already covered.
  const families = new Map<string, Resource[]>();
  for (const r of resources) {
    if (r.environment !== "Production" || r.state !== "Running") continue;
    if (!(r.type === "Virtual Machine" || r.type === "AKS Node Pool" || r.type === "SQL Database")) continue;
    if (r.utilizationP95 < 30) continue; // rightsizing candidates are excluded to avoid double counting
    const fam = r.type === "SQL Database" ? "SQL Database vCore" : r.sku.replace(/Standard_([A-Z]+)\d+[a-z]*_?(v\d)?.*/, "$1-series $2").trim();
    const key = `${fam}|${r.region}`;
    families.set(key, [...(families.get(key) ?? []), r]);
  }
  const ranked = [...families.entries()]
    .map(([key, rs]) => ({ key, rs, cost: rs.reduce((s, r) => s + r.monthlyCost, 0) }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 9);
  for (const g of ranked) {
    const [fam, region] = g.key.split("|");
    const anchor = g.rs.reduce((a, b) => (b.monthlyCost > a.monthlyCost ? b : a));
    const steady = g.cost * 0.45; // portion not already covered by existing reservations
    const term = g.cost > 250_000 ? "3-year" : "1-year";
    const pct = term === "3-year" ? 0.38 : 0.24;
    const draft: RecDraft = {
      title: `Purchase ${term} ${fam.includes("SQL") ? "reserved capacity" : "reservation"} for ${fam} in ${region} (${g.rs.length} resources)`,
      category: "Commitments",
      type: "Commitment purchase",
      savingsPct: pct,
      confidence: 89,
      risk: "Low",
      effort: "Low",
      rationale: `${g.rs.length} production resources run steady-state (p95 ≥ 30%) on on-demand pricing. 45% of this spend sits above the 90-day usage floor and is commitment-eligible.`,
      technicalImpact: "Billing-only change; no workload impact. Commitment is non-cancellable after 7-day window.",
      remediation: ["Confirm 12-month workload roadmap with owners", `Purchase ${term} commitment scoped to shared billing`, "Track utilization weekly; exchange if utilization < 90%"],
      current: [{ label: "Pricing", value: "On-demand" }, { label: "Eligible monthly spend", value: `$${Math.round(steady).toLocaleString("en-US")}` }, { label: "Resources", value: String(g.rs.length) }],
      proposed: [{ label: "Pricing", value: `${term} commitment` }, { label: "Expected discount", value: `${Math.round(pct * 100)}%` }],
    };
    const rec = make(anchor, draft, steady);
    if (rec) recs.push(rec);
  }
  return recs;
}

function heroRecommendation(): Recommendation {
  const created = "2026-09-13";
  const monthly = 214_800;
  const savings = 90_216; // 42% — M208ms_v2 → M128ms_v2 across 6 instances
  return {
    id: "REC-2041",
    title: "Rightsize SAP HANA scale set from M208ms_v2 to M128ms_v2",
    category: "Compute",
    type: "Rightsize scale set",
    resourceId: "res-hero-01",
    subscriptionId: "sub-erp-prod",
    resourceGroup: "rg-s4h-prd-eus2",
    teamId: "t-erp",
    ownerId: null,
    currentMonthlyCost: monthly,
    estimatedMonthlySavings: savings,
    confidence: 91,
    priority: "Critical",
    risk: "Medium",
    effort: "Medium",
    businessImpact:
      "Largest single compute opportunity in the portfolio. Reduces SAP S/4HANA infrastructure run-rate by 42% while keeping memory headroom above SAP sizing guidance for the current data footprint.",
    technicalImpact:
      "Rolling resize of 6 HANA nodes during the planned maintenance window; HANA system replication keeps the tier available. Requires SAP basis sign-off on memory sizing.",
    rationale:
      "Over 90 days the scale set peaked at 38.4% CPU (p95) and 2.4 TB of 5.7 TB memory per node. M128ms_v2 (3.8 TB) retains ~58% memory headroom above observed peak — inside the approved SAP sizing band — at 42% lower cost.",
    remediation: [
      "SAP Basis validates HANA memory sizing against the 90-day peak (2.4 TB)",
      "Resize secondary nodes first; fail over via HANA system replication",
      "Resize primary nodes in the Saturday maintenance window",
      "Run month-end close performance baseline and compare to prior close",
      "FinOps verifies savings against the next billing cycle",
    ],
    evidence: [
      { label: "Resource", value: "vmss-s4h-hana-prd-eus2 (6 instances)" },
      { label: "Observation window", value: "Trailing 90 days incl. quarter-end close" },
      { label: "CPU avg / p95", value: "22.6% / 38.4%" },
      { label: "Memory peak per node", value: "2.4 TB of 5.7 TB (42%)" },
      { label: "Monthly cost (run-rate)", value: "$214,800" },
      { label: "Detection rule", value: "Rightsize scale set (p95 CPU < 40%, memory < 50%)" },
    ],
    current: [
      { label: "SKU", value: "Standard_M208ms_v2" },
      { label: "Instances", value: "6" },
      { label: "Memory per node", value: "5.7 TB" },
      { label: "Monthly cost", value: "$214,800" },
    ],
    proposed: [
      { label: "SKU", value: "Standard_M128ms_v2" },
      { label: "Instances", value: "6" },
      { label: "Memory per node", value: "3.8 TB" },
      { label: "Monthly cost", value: "$124,584" },
    ],
    createdDate: created,
    dueDate: addDays(created, SLA_DAYS.Critical),
    slaDays: SLA_DAYS.Critical,
    stage: "validated",
    history: [
      { stage: "identified", at: created, byUserId: "u-system" },
      { stage: "validated", at: "2026-09-29", byUserId: "u-finops", note: "Estimate validated against two billing cycles and SAP sizing guidance." },
    ],
    ticketId: null,
    comments: [
      { id: "c-hero-1", authorId: "u-finops", at: "2026-09-29", body: "Validated: estimate reconciles to the last two invoices. Memory headroom remains inside the SAP sizing band. Needs an accountable owner in ERP Platform.", kind: "comment" },
      { id: "c-hero-2", authorId: "u-erp2", at: "2026-10-02", body: "HANA system replication is healthy — a rolling resize is feasible in the Saturday window.", kind: "comment" },
    ],
    approval: null,
    realizedDate: null,
    realizedMonthlySavings: 0,
    isHero: true,
  };
}

// ---------------------------------------------------------------------------
// Tickets, anomalies, reservations, exceptions
// ---------------------------------------------------------------------------
function buildTickets(rng: Rng, recs: Recommendation[]): Ticket[] {
  const tickets: Ticket[] = [];
  let n = 1000;
  for (const r of recs) {
    const assigned = r.history.find((h) => h.stage === "assigned");
    if (!assigned || !r.ownerId) continue;
    const advanced = ["in_progress", "submitted", "approved", "implemented", "verified", "closed"].includes(r.stage);
    if (!rng.chance(advanced ? 0.92 : r.stage === "assigned" ? 0.55 : 0.4)) continue;
    n++;
    const t: Ticket = {
      id: `FCC-${n}`,
      recommendationId: r.id,
      title: `[FinOps] ${r.title}`,
      assigneeId: r.ownerId,
      priority: r.priority,
      status: TICKET_STATUS_FOR_STAGE[r.stage] ?? "Open",
      createdAt: assigned.at,
      updatedAt: r.history[r.history.length - 1].at,
      dueDate: r.dueDate,
      system: "Local Demo Ticketing",
    };
    r.ticketId = t.id;
    tickets.push(t);
  }
  return tickets;
}

function buildAnomalies(): Anomaly[] {
  const a = (id: string, date: string, service: string, category: CostCategory, sub: string, rg: string, base: number, obs: number, owner: string, status: Anomaly["status"], cause: string, ack: string | null): Anomaly => ({
    id, date, service, category, subscriptionId: sub, resourceGroup: rg, baselineDaily: base, observedDaily: obs, ownerId: owner, status, rootCause: cause, acknowledgedBy: ack,
  });
  return [
    a("ANM-0412", "2026-10-06", "Azure OpenAI Service", "Analytics & AI", "sub-ml-prod", "rg-assist-prd-eus2", 1850, 4920, "u-ml1", "New", "Provisioned throughput increased for a batch evaluation job; allocation was not reverted.", null),
    a("ANM-0411", "2026-10-05", "Azure Databricks", "Analytics & AI", "sub-data-prod", "rg-lake-prd-eus2", 9800, 15600, "u-data1", "Investigating", "All-purpose cluster left running across the weekend without auto-termination.", null),
    a("ANM-0410", "2026-10-04", "Bandwidth", "Network", "sub-com-prod", "rg-portal-prd-wus3", 1200, 2650, "u-com1", "Acknowledged", "Partner catalog re-sync generated inter-region egress.", "u-com1"),
    a("ANM-0409", "2026-10-03", "Azure Monitor", "Management & Security", "sub-mgmt", "rg-obs-shr-eus2", 1400, 2380, "u-cloud2", "Investigating", "Verbose diagnostic settings enabled on AKS clusters during incident triage.", null),
    a("ANM-0408", "2026-10-02", "Virtual Machine Scale Sets", "Compute", "sub-eng-dev", "rg-bfarm-dev-eus2", 3100, 4450, "u-hpc2", "New", "Regression farm scaled out for tape-out validation without a scale-in schedule.", null),
    a("ANM-0407", "2026-09-28", "Azure SQL Database", "Database", "sub-erp-nonprod", "rg-s4h-dev-eus2", 820, 1510, "u-erp2", "Resolved", "Performance test environment scaled to Business Critical and not reverted.", "u-erp2"),
    a("ANM-0406", "2026-09-24", "Storage", "Storage", "sub-data-prod", "rg-lake-prd-eus2", 2900, 3980, "u-data2", "Resolved", "Historical backfill written to Hot tier; lifecycle rule applied.", "u-data2"),
    a("ANM-0405", "2026-09-21", "Azure Kubernetes Service", "Compute", "sub-com-prod", "rg-catalog-prd-eus2", 2400, 3450, "u-com2", "Acknowledged", "Seasonal campaign traffic — expected and budgeted.", "u-com1"),
    a("ANM-0404", "2026-09-18", "Azure Cosmos DB", "Database", "sub-com-prod", "rg-support-prd-eus2", 1650, 2700, "u-com2", "Resolved", "Manual throughput increase during data migration; reverted.", "u-com2"),
    a("ANM-0403", "2026-09-15", "Azure Machine Learning", "Analytics & AI", "sub-ml-prod", "rg-mlt-prd-eus2", 2100, 3600, "u-ml2", "Resolved", "GPU cluster min-nodes set above zero for a training sprint.", "u-ml1"),
    a("ANM-0402", "2026-09-11", "Microsoft Defender for Cloud", "Management & Security", "sub-sec", "rg-secops-prd-eus2", 450, 780, "u-sec1", "Acknowledged", "Defender for Servers P2 enabled on new subscriptions — expected.", "u-sec1"),
    a("ANM-0401", "2026-09-08", "Azure Firewall", "Network", "sub-hub", "rg-hub-shr-eus2", 300, 520, "u-cloud1", "Resolved", "Additional premium firewall deployed for regional failover test.", "u-cloud1"),
  ];
}

function buildReservations(resources: Resource[]): Reservation[] {
  const eligible = resources
    .filter((r) => r.environment === "Production" && r.state === "Running" && (r.type === "Virtual Machine" || r.type === "AKS Node Pool" || r.type === "SQL Database" || r.type === "VM Scale Set"))
    .reduce((s, r) => s + r.monthlyCost, 0);
  const rows: [string, Reservation["kind"], string, Reservation["term"], string, number, number, number, string][] = [
    ["RI-DSv5-EUS2", "Reserved Instance", "Dsv5-series", "3 years", "Shared", 0.11, 0.6, 97.8, "2028-04-30"],
    ["RI-ESv5-EUS2", "Reserved Instance", "Esv5-series", "3 years", "Shared", 0.08, 0.6, 94.2, "2028-01-31"],
    ["RI-Msv2-EUS2", "Reserved Instance", "Msv2-series", "1 year", "Single subscription (erp-production)", 0.07, 0.38, 99.1, "2027-03-31"],
    ["RI-HBv3-WUS3", "Reserved Instance", "HBv3-series", "1 year", "Single subscription (engineering-compute-prod)", 0.05, 0.36, 71.4, "2026-12-31"],
    ["RI-FSv2-CUS", "Reserved Instance", "FSv2-series", "1 year", "Shared", 0.035, 0.36, 63.8, "2026-11-30"],
    ["SP-COMPUTE-01", "Savings Plan", "Compute savings plan", "3 years", "Shared", 0.12, 0.52, 98.6, "2028-09-30"],
    ["SP-COMPUTE-02", "Savings Plan", "Compute savings plan", "1 year", "Shared", 0.06, 0.28, 96.9, "2027-06-30"],
    ["RC-SQL-GP-EUS2", "Reserved Instance", "SQL Database vCore (GP)", "3 years", "Shared", 0.045, 0.55, 88.5, "2028-02-29"],
    ["RC-SQL-BC-NEU", "Reserved Instance", "SQL Database vCore (BC)", "1 year", "Shared", 0.02, 0.33, 58.2, "2027-01-31"],
    ["RI-DSv3-WEU", "Reserved Instance", "Dsv3-series", "1 year", "Shared", 0.015, 0.36, 41.7, "2026-11-15"],
  ];
  return rows.map(([id, kind, family, term, scope, share, discount, util, expiry]) => {
    const odEq = round(eligible * share, 0);
    return { id, name: id, kind, family, term, scope, monthlyOnDemandEquivalent: odEq, monthlyCommitment: round(odEq * (1 - discount), 0), utilization: util, expiryDate: expiry };
  });
}

const POLICY_EXCEPTIONS: PolicyException[] = [
  { id: "EXC-118", policy: "Require cost-center tag", subscriptionId: "sub-corp-sandbox", requestedById: "u-corp1", reason: "Sandbox resources created by training labs", expires: "2026-12-31", status: "Active" },
  { id: "EXC-117", policy: "Allowed VM SKUs (v5 only)", subscriptionId: "sub-eng-prod", requestedById: "u-hpc1", reason: "EDA tool certification pinned to HC44rs", expires: "2027-03-31", status: "Active" },
  { id: "EXC-116", policy: "Geo-redundant storage in non-production", subscriptionId: "sub-data-dev", requestedById: "u-data2", reason: "DR rehearsal dataset", expires: "2026-10-15", status: "Expiring" },
  { id: "EXC-115", policy: "Auto-shutdown for dev VMs", subscriptionId: "sub-eng-dev", requestedById: "u-hpc2", reason: "Nightly regression suites", expires: "2026-10-20", status: "Expiring" },
  { id: "EXC-114", policy: "Require owner tag", subscriptionId: "sub-mgmt", requestedById: "u-cloud2", reason: "Platform-managed resources inherit owner from landing zone", expires: "2027-06-30", status: "Active" },
  { id: "EXC-113", policy: "Public IP restrictions", subscriptionId: "sub-com-prod", requestedById: "u-com1", reason: "Partner allow-list static IPs", expires: "2027-01-31", status: "Active" },
  { id: "EXC-112", policy: "Allowed regions", subscriptionId: "sub-ml-prod", requestedById: "u-ml1", reason: "GPU capacity only available in West US 3", expires: "2026-09-30", status: "Expired" },
  { id: "EXC-111", policy: "Diagnostic settings retention ≤ 30 days", subscriptionId: "sub-sec", requestedById: "u-sec1", reason: "Security investigations require 180-day interactive retention", expires: "2027-09-30", status: "Active" },
];

// ---------------------------------------------------------------------------
// Cost history and budgets
// ---------------------------------------------------------------------------
function buildCosts(rng: Rng, resources: Resource[], recs: Recommendation[], subscriptions: Subscription[]) {
  const realizedByResource = new Map<string, { date: string; savings: number }[]>();
  for (const r of recs) {
    if (!r.realizedDate) continue;
    realizedByResource.set(r.resourceId, [...(realizedByResource.get(r.resourceId) ?? []), { date: r.realizedDate, savings: r.realizedMonthlySavings }]);
  }
  const seasonal: Record<string, number> = { "2025-11": 1.0, "2025-12": 1.035, "2026-01": 0.985, "2026-02": 0.99, "2026-03": 1.02, "2026-04": 1.0, "2026-05": 1.005, "2026-06": 1.025, "2026-07": 0.995, "2026-08": 1.0, "2026-09": 1.015 };
  const monthly = new Map<string, number>();
  const subSeed = new Map(SUBSCRIPTION_SEEDS.map((s) => [s.id, s]));
  HISTORY_MONTHS.forEach((m, i) => {
    const monthsBack = HISTORY_MONTHS.length - i; // Sep = 1 month back
    const monthEnd = `${m}-28`;
    const noise = new Map<string, number>();
    for (const r of resources) {
      const s = subSeed.get(r.subscriptionId)!;
      const nk = `${r.subscriptionId}|${r.category}`;
      if (!noise.has(nk)) noise.set(nk, createRng(hash(`${nk}|${m}`)).range(0.965, 1.035));
      // Cost before optimizations realized after this month.
      const addBack = (realizedByResource.get(r.id) ?? []).filter((x) => x.date > monthEnd).reduce((a, x) => a + x.savings, 0);
      // Resources created after this month did not exist yet.
      if (r.createdDate > `${m}-31`) continue;
      const cost = (r.monthlyCost + addBack) * Math.pow(1 + s.growth, -monthsBack) * seasonal[m] * noise.get(nk)!;
      const key = `${m}|${r.subscriptionId}|${r.category}`;
      monthly.set(key, (monthly.get(key) ?? 0) + cost);
    }
  });
  const monthlyCosts: MonthlyCostRow[] = [...monthly.entries()].map(([k, cost]) => {
    const [month, subscriptionId, category] = k.split("|");
    return { month, subscriptionId, category: category as CostCategory, cost: round(cost, 2) };
  });

  const runRate = resources.reduce((s, r) => s + r.monthlyCost, 0);
  const anomalies = buildAnomalies();
  const dailyCosts: DailyCostRow[] = [];
  for (let d = 1; d <= DAY_OF_MONTH; d++) {
    const date = `${CURRENT_MONTH}-${String(d).padStart(2, "0")}`;
    const dow = toDate(date).getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.955 : 1.012;
    const extra = anomalies.filter((a) => a.date === date).reduce((s, a) => s + (a.observedDaily - a.baselineDaily), 0);
    dailyCosts.push({ date, cost: round((runRate / 31) * weekend * rng.range(0.985, 1.015) + extra, 2) });
  }
  const sepTotal = monthlyCosts.filter((r) => r.month === "2026-09").reduce((s, r) => s + r.cost, 0);
  const priorMonthDailyCosts: DailyCostRow[] = [];
  for (let d = 1; d <= 30; d++) {
    const date = `2026-09-${String(d).padStart(2, "0")}`;
    const dow = toDate(date).getUTCDay();
    const weekend = dow === 0 || dow === 6 ? 0.955 : 1.018;
    priorMonthDailyCosts.push({ date, cost: round((sepTotal / 30) * weekend * rng.range(0.985, 1.015), 2) });
  }
  // Normalize prior-month daily to reconcile to the monthly total exactly.
  const pSum = priorMonthDailyCosts.reduce((s, r) => s + r.cost, 0);
  priorMonthDailyCosts.forEach((r) => (r.cost = round((r.cost * sepTotal) / pSum, 2)));

  const octBudget = subscriptions.reduce((s, x) => s + x.monthlyBudget, 0);
  const allMonths = [...HISTORY_MONTHS, ...FORECAST_MONTHS];
  const monthlyBudgets = allMonths.map((m, i) => ({ month: m, budget: round(octBudget * Math.pow(1.0085, i - HISTORY_MONTHS.length), -3) }));
  return { monthlyCosts, dailyCosts, priorMonthDailyCosts, monthlyBudgets, anomalies };
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------
export function generateDataset(seed = DEMO_SEED): Dataset {
  const rng = createRng(seed);
  const raw = generateResources(rng);
  // Scale to target run-rate (excluding hero) so headline numbers land in a realistic enterprise range.
  const hero = heroResource();
  const rawTotal = raw.reduce((s, r) => s + r.monthlyCost, 0);
  const factor = (TARGET_MONTHLY_RUN_RATE - hero.monthlyCost) / rawTotal;
  for (const r of raw) r.monthlyCost = round(r.monthlyCost * factor, 2);
  const resources = [hero, ...raw];
  for (const r of resources) r.governanceIssues = assignGovernance(r);

  const recs = [heroRecommendation(), ...buildRecommendations(rng, resources)];
  // Realized optimizations already reduced the current run-rate of the resource.
  for (const rec of recs) {
    if (!rec.realizedDate) continue;
    const res = resources.find((r) => r.id === rec.resourceId)!;
    res.monthlyCost = round(Math.max(0, res.monthlyCost - rec.realizedMonthlySavings), 2);
    if (res.monthlyCost < 1) {
      res.monthlyCost = 0;
      res.state = "Decommissioned";
      res.utilization = 0;
      res.utilizationP95 = 0;
      res.governanceIssues = [];
    }
  }
  const tickets = buildTickets(rng, recs);

  const subscriptions: Subscription[] = SUBSCRIPTION_SEEDS.map((s) => {
    const sr = createRng(hash(s.id));
    const runRate = resources.filter((r) => r.subscriptionId === s.id).reduce((a, r) => a + r.monthlyCost, 0);
    return {
      id: s.id,
      name: s.name,
      subscriptionGuid: guid(sr),
      businessUnitId: s.businessUnitId,
      environment: s.environment,
      ownerId: s.ownerId,
      costCenter: BUSINESS_UNITS.find((b) => b.id === s.businessUnitId)!.costCenter,
      monthlyBudget: round(runRate * s.budgetFactor, -3),
    };
  });

  const { monthlyCosts, dailyCosts, priorMonthDailyCosts, monthlyBudgets, anomalies } = buildCosts(rng, resources, recs, subscriptions);

  const audit = recs
    .flatMap((r) => r.history.filter((h) => h.stage !== "identified").map((h) => ({ r, h })))
    .sort((a, b) => (a.h.at < b.h.at ? 1 : a.h.at > b.h.at ? -1 : a.r.id < b.r.id ? 1 : -1))
    .slice(0, 60)
    .map(({ r, h }, i) => ({ id: `seed-${i}`, at: h.at, actorId: h.byUserId, action: `Stage changed to ${h.stage.replace("_", " ")}`, target: r.id, detail: r.title }));

  return {
    asOf: AS_OF,
    users: USERS,
    teams: TEAMS,
    businessUnits: BUSINESS_UNITS,
    applications: APPLICATIONS,
    subscriptions,
    resources,
    reservations: buildReservations(resources),
    policyExceptions: POLICY_EXCEPTIONS,
    monthlyCosts,
    dailyCosts,
    priorMonthDailyCosts,
    monthlyBudgets,
    version: 1,
    recommendations: recs,
    tickets,
    anomalies,
    audit,
    sequence: 0,
  };
}

let cached: Dataset | null = null;
/** Memoized seed dataset — generated once per process / browser session. */
export function getSeedDataset(): Dataset {
  if (!cached) cached = generateDataset();
  return cached;
}
