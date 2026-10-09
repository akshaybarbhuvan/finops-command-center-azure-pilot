// Organizational reference data for the demo tenant. All names are fictional.
import type { Application, BusinessUnit, Environment, Team, User } from "./types";

export const AS_OF = "2026-10-07";
export const CURRENT_MONTH = "2026-10";
export const DAYS_IN_CURRENT_MONTH = 31;
export const DAY_OF_MONTH = 7;
export const DEMO_SEED = 20261007;

export const BUSINESS_UNITS: BusinessUnit[] = [
  { id: "bu-ea", name: "Enterprise Applications", costCenter: "CC-1100", executiveSponsor: "u-exec" },
  { id: "bu-eng", name: "Engineering R&D", costCenter: "CC-2100", executiveSponsor: "u-exec" },
  { id: "bu-data", name: "Data & Analytics", costCenter: "CC-3100", executiveSponsor: "u-exec" },
  { id: "bu-com", name: "Digital Commerce", costCenter: "CC-4100", executiveSponsor: "u-cfo" },
  { id: "bu-corp", name: "Corporate Services", costCenter: "CC-5100", executiveSponsor: "u-cfo" },
  { id: "bu-shared", name: "Shared Platform", costCenter: "CC-9100", executiveSponsor: "u-exec" },
];

export const TEAMS: Team[] = [
  { id: "t-exec", name: "Executive Leadership", leadId: "u-exec", businessUnitId: "bu-corp" },
  { id: "t-finops", name: "FinOps Office", leadId: "u-finops", businessUnitId: "bu-corp" },
  { id: "t-erp", name: "ERP Platform", leadId: "u-priya", businessUnitId: "bu-ea" },
  { id: "t-hpc", name: "Engineering Compute", leadId: "u-hpc1", businessUnitId: "bu-eng" },
  { id: "t-data", name: "Data Platform", leadId: "u-data1", businessUnitId: "bu-data" },
  { id: "t-ml", name: "ML Platform", leadId: "u-ml1", businessUnitId: "bu-data" },
  { id: "t-com", name: "Commerce Engineering", leadId: "u-com1", businessUnitId: "bu-com" },
  { id: "t-corp", name: "Corporate IT", leadId: "u-corp1", businessUnitId: "bu-corp" },
  { id: "t-cloud", name: "Cloud Platform", leadId: "u-cloud1", businessUnitId: "bu-shared" },
  { id: "t-sec", name: "Security Engineering", leadId: "u-sec1", businessUnitId: "bu-shared" },
];

const u = (id: string, name: string, title: string, role: User["role"], teamId: string): User => ({
  id,
  name,
  title,
  role,
  teamId,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@demo.fcc.local`,
  initials: name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase(),
});

export const USERS: User[] = [
  u("u-exec", "Alex Morgan", "Chief Information Officer", "executive", "t-exec"),
  u("u-cfo", "Taylor Brooks", "VP, Finance & Planning", "executive", "t-exec"),
  u("u-finops", "Jordan Lee", "Director, Cloud FinOps", "finops", "t-finops"),
  u("u-finops2", "Maya Chen", "FinOps Analyst", "finops", "t-finops"),
  u("u-admin", "Sam Patel", "Platform Administrator", "admin", "t-cloud"),
  u("u-priya", "Priya Raman", "Principal Engineer, ERP Platform", "engineering", "t-erp"),
  u("u-erp2", "Marcus Hill", "Senior Engineer, ERP Platform", "engineering", "t-erp"),
  u("u-hpc1", "Elena Kovacs", "Engineering Manager, Engineering Compute", "engineering", "t-hpc"),
  u("u-hpc2", "Daniel Okafor", "Senior Engineer, Engineering Compute", "engineering", "t-hpc"),
  u("u-data1", "Wei Zhang", "Lead Engineer, Data Platform", "engineering", "t-data"),
  u("u-data2", "Hannah Schultz", "Data Engineer, Data Platform", "engineering", "t-data"),
  u("u-ml1", "Ravi Iyer", "Lead, ML Platform", "engineering", "t-ml"),
  u("u-ml2", "Grace Kim", "ML Engineer, ML Platform", "engineering", "t-ml"),
  u("u-com1", "Chloe Martin", "Engineering Lead, Commerce", "engineering", "t-com"),
  u("u-com2", "Lucas Silva", "Senior Engineer, Commerce", "engineering", "t-com"),
  u("u-corp1", "Fatima Noor", "Manager, Corporate IT", "engineering", "t-corp"),
  u("u-cloud1", "Ben Carter", "Lead, Cloud Platform", "engineering", "t-cloud"),
  u("u-cloud2", "Aisha Bello", "Cloud Engineer, Cloud Platform", "engineering", "t-cloud"),
  u("u-sec1", "Noah Fischer", "Lead, Security Engineering", "engineering", "t-sec"),
  u("u-system", "FCC Rules Engine", "Service account", "admin", "t-finops"),
];

export const APPLICATIONS: Application[] = [
  { id: "app-s4", name: "SAP S/4HANA", businessUnitId: "bu-ea", teamId: "t-erp", criticality: "Tier 1" },
  { id: "app-bw", name: "SAP BW Reporting", businessUnitId: "bu-ea", teamId: "t-erp", criticality: "Tier 2" },
  { id: "app-scp", name: "Supply Chain Planning", businessUnitId: "bu-ea", teamId: "t-erp", criticality: "Tier 1" },
  { id: "app-dvg", name: "Design Verification Grid", businessUnitId: "bu-eng", teamId: "t-hpc", criticality: "Tier 1" },
  { id: "app-bfarm", name: "Build & Regression Farm", businessUnitId: "bu-eng", teamId: "t-hpc", criticality: "Tier 2" },
  { id: "app-fwci", name: "Firmware CI", businessUnitId: "bu-eng", teamId: "t-hpc", criticality: "Tier 2" },
  { id: "app-lake", name: "Enterprise Data Lake", businessUnitId: "bu-data", teamId: "t-data", criticality: "Tier 1" },
  { id: "app-awb", name: "Analytics Workbench", businessUnitId: "bu-data", teamId: "t-data", criticality: "Tier 2" },
  { id: "app-mlt", name: "ML Training Platform", businessUnitId: "bu-data", teamId: "t-ml", criticality: "Tier 2" },
  { id: "app-assist", name: "Employee Assistant", businessUnitId: "bu-data", teamId: "t-ml", criticality: "Tier 3" },
  { id: "app-portal", name: "Partner Portal", businessUnitId: "bu-com", teamId: "t-com", criticality: "Tier 1" },
  { id: "app-support", name: "Customer Support Platform", businessUnitId: "bu-com", teamId: "t-com", criticality: "Tier 2" },
  { id: "app-catalog", name: "Product Catalog API", businessUnitId: "bu-com", teamId: "t-com", criticality: "Tier 2" },
  { id: "app-close", name: "Finance Close Automation", businessUnitId: "bu-corp", teamId: "t-corp", criticality: "Tier 2" },
  { id: "app-hr", name: "HR Integrations", businessUnitId: "bu-corp", teamId: "t-corp", criticality: "Tier 3" },
  { id: "app-collab", name: "Collaboration Services", businessUnitId: "bu-corp", teamId: "t-corp", criticality: "Tier 3" },
  { id: "app-hub", name: "Connectivity Hub", businessUnitId: "bu-shared", teamId: "t-cloud", criticality: "Tier 1" },
  { id: "app-obs", name: "Observability Platform", businessUnitId: "bu-shared", teamId: "t-cloud", criticality: "Tier 2" },
  { id: "app-secops", name: "Security Operations", businessUnitId: "bu-shared", teamId: "t-sec", criticality: "Tier 1" },
];

export interface SubscriptionSeed {
  id: string;
  name: string;
  businessUnitId: string;
  environment: Environment;
  ownerId: string;
  apps: string[];
  /** Budget as a multiple of the current run-rate; < 1 means forecast to overrun. */
  budgetFactor: number;
  /** Month-over-month growth used to reconstruct history. */
  growth: number;
  /** Relative weight when placing general-purpose resources. */
  weight: number;
}

export const SUBSCRIPTION_SEEDS: SubscriptionSeed[] = [
  { id: "sub-erp-prod", name: "erp-production", businessUnitId: "bu-ea", environment: "Production", ownerId: "u-priya", apps: ["app-s4", "app-bw", "app-scp"], budgetFactor: 1.06, growth: 0.006, weight: 10 },
  { id: "sub-erp-nonprod", name: "erp-nonproduction", businessUnitId: "bu-ea", environment: "Development", ownerId: "u-erp2", apps: ["app-s4", "app-bw", "app-scp"], budgetFactor: 0.93, growth: 0.011, weight: 6 },
  { id: "sub-eng-prod", name: "engineering-compute-prod", businessUnitId: "bu-eng", environment: "Production", ownerId: "u-hpc1", apps: ["app-dvg", "app-bfarm"], budgetFactor: 1.08, growth: 0.012, weight: 10 },
  { id: "sub-eng-dev", name: "engineering-dev", businessUnitId: "bu-eng", environment: "Development", ownerId: "u-hpc2", apps: ["app-bfarm", "app-fwci"], budgetFactor: 0.91, growth: 0.016, weight: 7 },
  { id: "sub-data-prod", name: "data-platform-prod", businessUnitId: "bu-data", environment: "Production", ownerId: "u-data1", apps: ["app-lake", "app-awb"], budgetFactor: 0.97, growth: 0.021, weight: 8 },
  { id: "sub-data-dev", name: "data-platform-dev", businessUnitId: "bu-data", environment: "Development", ownerId: "u-data2", apps: ["app-lake", "app-awb"], budgetFactor: 0.95, growth: 0.018, weight: 4 },
  { id: "sub-ml-prod", name: "ml-platform-prod", businessUnitId: "bu-data", environment: "Production", ownerId: "u-ml1", apps: ["app-mlt", "app-assist"], budgetFactor: 0.88, growth: 0.034, weight: 4 },
  { id: "sub-com-prod", name: "commerce-prod", businessUnitId: "bu-com", environment: "Production", ownerId: "u-com1", apps: ["app-portal", "app-support", "app-catalog"], budgetFactor: 1.09, growth: 0.009, weight: 8 },
  { id: "sub-com-stage", name: "commerce-staging", businessUnitId: "bu-com", environment: "Staging", ownerId: "u-com2", apps: ["app-portal", "app-support", "app-catalog"], budgetFactor: 1.05, growth: 0.008, weight: 4 },
  { id: "sub-corp-prod", name: "corporate-it-prod", businessUnitId: "bu-corp", environment: "Production", ownerId: "u-corp1", apps: ["app-close", "app-hr", "app-collab"], budgetFactor: 1.12, growth: 0.004, weight: 5 },
  { id: "sub-corp-sandbox", name: "corporate-sandbox", businessUnitId: "bu-corp", environment: "Test", ownerId: "u-corp1", apps: ["app-hr", "app-collab"], budgetFactor: 0.98, growth: 0.007, weight: 2 },
  { id: "sub-hub", name: "platform-connectivity", businessUnitId: "bu-shared", environment: "Shared", ownerId: "u-cloud1", apps: ["app-hub"], budgetFactor: 1.09, growth: 0.005, weight: 2 },
  { id: "sub-mgmt", name: "platform-management", businessUnitId: "bu-shared", environment: "Shared", ownerId: "u-cloud2", apps: ["app-obs"], budgetFactor: 1.03, growth: 0.013, weight: 2 },
  { id: "sub-sec", name: "security-operations", businessUnitId: "bu-shared", environment: "Production", ownerId: "u-sec1", apps: ["app-secops"], budgetFactor: 1.1, growth: 0.008, weight: 2 },
];

export const REGIONS = ["East US 2", "West US 3", "Central US", "North Europe", "West Europe", "Southeast Asia"] as const;

export const SLA_DAYS: Record<"Critical" | "High" | "Medium" | "Low", number> = {
  Critical: 30,
  High: 45,
  Medium: 60,
  Low: 90,
};
