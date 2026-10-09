// Domain types for the FinOps Command Center demo data model.
// All data described by these types is synthetic and illustrative.

export type Role = "executive" | "finops" | "engineering" | "admin";

export type Environment = "Production" | "Staging" | "Development" | "Test" | "Shared";

export type CostCategory = "Compute" | "Storage" | "Database" | "Network" | "Analytics & AI" | "Management & Security";

export type RecCategory = "Compute" | "Storage" | "Database" | "Network" | "Commitments" | "Other";

export type Priority = "Critical" | "High" | "Medium" | "Low";

export type Risk = "Low" | "Medium" | "High";

export type Stage =
  | "identified"
  | "validated"
  | "assigned"
  | "in_progress"
  | "submitted"
  | "approved"
  | "implemented"
  | "verified"
  | "closed"
  | "rejected"
  | "deferred";

export type GovernanceIssue =
  | "missing_owner"
  | "missing_cost_center"
  | "idle"
  | "aged_snapshot"
  | "orphaned"
  | "legacy_sku"
  | "nonprod_geo_redundancy"
  | "policy_exception";

export interface User {
  id: string;
  name: string;
  title: string;
  role: Role;
  teamId: string;
  email: string;
  initials: string;
}

export interface Team {
  id: string;
  name: string;
  leadId: string;
  businessUnitId: string;
}

export interface BusinessUnit {
  id: string;
  name: string;
  costCenter: string;
  executiveSponsor: string;
}

export interface Application {
  id: string;
  name: string;
  businessUnitId: string;
  teamId: string;
  criticality: "Tier 1" | "Tier 2" | "Tier 3";
}

export interface Subscription {
  id: string;
  name: string;
  subscriptionGuid: string;
  businessUnitId: string;
  environment: Environment;
  ownerId: string;
  costCenter: string;
  /** Monthly budget for the current month (USD). */
  monthlyBudget: number;
}

export interface Resource {
  id: string;
  name: string;
  type: string;
  service: string;
  category: CostCategory;
  sku: string;
  subscriptionId: string;
  resourceGroup: string;
  region: string;
  environment: Environment;
  applicationId: string;
  ownerId: string | null;
  costCenter: string | null;
  /** Current monthly run-rate (USD). */
  monthlyCost: number;
  /** Average utilization over the trailing 30 days (0-100). */
  utilization: number;
  /** p95 utilization (0-100). */
  utilizationP95: number;
  state: "Running" | "Deallocated" | "Unattached" | "Idle" | "Active" | "Decommissioned";
  createdDate: string;
  ageDays: number;
  instanceCount: number;
  redundancy?: "LRS" | "ZRS" | "GRS" | "RA-GRS";
  governanceIssues: GovernanceIssue[];
}

export interface StageEvent {
  stage: Stage;
  at: string; // ISO date
  byUserId: string;
  note?: string;
}

export interface Comment {
  id: string;
  authorId: string;
  at: string;
  body: string;
  kind: "comment" | "evidence" | "system";
}

export interface Recommendation {
  id: string;
  title: string;
  category: RecCategory;
  type: string;
  resourceId: string;
  subscriptionId: string;
  resourceGroup: string;
  teamId: string;
  /** Accountable owner once assigned. Null while unassigned. */
  ownerId: string | null;
  currentMonthlyCost: number;
  estimatedMonthlySavings: number;
  confidence: number; // 0-100
  priority: Priority;
  risk: Risk;
  effort: "Low" | "Medium" | "High";
  businessImpact: string;
  technicalImpact: string;
  rationale: string;
  remediation: string[];
  evidence: { label: string; value: string }[];
  current: { label: string; value: string }[];
  proposed: { label: string; value: string }[];
  createdDate: string;
  dueDate: string;
  slaDays: number;
  stage: Stage;
  history: StageEvent[];
  ticketId: string | null;
  comments: Comment[];
  approval: { approverId: string; at: string; decision: "approved" | "rejected" | "deferred"; note: string } | null;
  /** Date savings were verified as realized (verified/closed stages). */
  realizedDate: string | null;
  /** Verified monthly savings (may differ slightly from estimate). */
  realizedMonthlySavings: number;
  /** Technical owner's decision after routing (accepted / rejected / deferred, with reason). */
  ownerDecision?: { decision: "accepted" | "rejected" | "deferred"; at: string; byUserId: string; reason: string } | null;
  /** Remediation plan submitted by the owner for change approval. */
  remediationPlan?: string;
  /** Change approval reference recorded by the owner from the organization's change process (simulated locally in the demo). */
  changeApproval?: { reference: string; at: string; recordedBy: string; simulated: true } | null;
  tags?: string[];
  sharedWith?: string[];
  isHero?: boolean;
}

export type TicketStatus = "Open" | "In Progress" | "Pending Approval" | "Approved" | "Resolved" | "Closed" | "Cancelled";

export interface Ticket {
  id: string;
  recommendationId: string;
  title: string;
  assigneeId: string;
  priority: Priority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  dueDate: string;
  system: "Local Demo Ticketing";
  /** Optional reference to an existing ticket in another system (recorded as text only; no external connection). */
  externalRef?: string;
}

export type AnomalyStatus = "New" | "Investigating" | "Acknowledged" | "Resolved";

export interface Anomaly {
  id: string;
  date: string;
  service: string;
  category: CostCategory;
  subscriptionId: string;
  resourceGroup: string;
  baselineDaily: number;
  observedDaily: number;
  ownerId: string;
  status: AnomalyStatus;
  rootCause: string;
  acknowledgedBy: string | null;
}

export interface Reservation {
  id: string;
  name: string;
  kind: "Reserved Instance" | "Savings Plan";
  family: string;
  term: "1 year" | "3 years";
  scope: string;
  monthlyCommitment: number;
  /** On-demand equivalent value of usage covered at 100% utilization. */
  monthlyOnDemandEquivalent: number;
  utilization: number; // 0-100
  expiryDate: string;
}

export interface PolicyException {
  id: string;
  policy: string;
  subscriptionId: string;
  requestedById: string;
  reason: string;
  expires: string;
  status: "Active" | "Expiring" | "Expired";
}

export interface MonthlyCostRow {
  month: string; // YYYY-MM
  subscriptionId: string;
  category: CostCategory;
  cost: number;
}

export interface DailyCostRow {
  date: string; // YYYY-MM-DD
  cost: number;
}

export interface AuditEvent {
  id: string;
  at: string;
  actorId: string;
  action: string;
  target: string;
  detail: string;
}

/** Static (immutable) portion of the dataset. */
export interface StaticDataset {
  asOf: string;
  users: User[];
  teams: Team[];
  businessUnits: BusinessUnit[];
  applications: Application[];
  subscriptions: Subscription[];
  resources: Resource[];
  reservations: Reservation[];
  policyExceptions: PolicyException[];
  monthlyCosts: MonthlyCostRow[];
  dailyCosts: DailyCostRow[];
  priorMonthDailyCosts: DailyCostRow[];
  monthlyBudgets: { month: string; budget: number }[];
}

/** Mutable portion — changes as the presenter runs workflows. */
export interface DemoState {
  version: number;
  recommendations: Recommendation[];
  tickets: Ticket[];
  anomalies: Anomaly[];
  audit: AuditEvent[];
  sequence: number;
}

export interface Dataset extends StaticDataset, DemoState {}
