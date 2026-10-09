// Shared, side-effect-free checks for the Azure deployment target. Used by deploy-guard.mjs (GitHub Actions)
// and azure-preflight.mjs (operator workstation). Nothing here calls Azure.

// Tag that main.bicep puts on every taggable pilot resource (and that the runbook puts on the resource group).
// Deployments refuse targets without it, so a mistyped variable cannot point at another workload's web app.
export const WORKLOAD_TAG = "fcc-workload";
export const WORKLOAD_TAG_VALUE = "finops-command-center-azure-pilot";

// The separate FinThrive pilot must never be targeted. Any subscription, resource group or web app whose name
// matches is refused, in addition to the explicit deny list FCC_DENY_SUBSCRIPTION_IDS (comma separated IDs).
export const DENY_NAME_PATTERN = /finthrive/i;

export const REQUIRED_PROVIDERS = ["Microsoft.Web", "Microsoft.Sql", "Microsoft.KeyVault", "Microsoft.OperationalInsights", "Microsoft.Insights", "Microsoft.Consumption"];

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isGuid = (v) => typeof v === "string" && GUID.test(v.trim());
// Resource group: 1-90 chars of letters, digits, underscore, hyphen, period, parentheses; must not end with a period.
export const isResourceGroupName = (v) => typeof v === "string" && /^[\w\-.()]{1,90}$/.test(v) && !v.endsWith(".");
// Web app: 2-60 chars of letters, digits and hyphens; must not start or end with a hyphen.
export const isWebAppName = (v) => typeof v === "string" && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,58}[a-zA-Z0-9])$/.test(v);
// main.bicep namePrefix: it becomes part of the Key Vault (letters/digits, must start with a letter), SQL server
// (lowercase, no leading/trailing hyphen) and web app names, so only lowercase letters, digits and single hyphens.
export const isNamePrefix = (v) => typeof v === "string" && v.length >= 3 && v.length <= 16 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v);

export const denySubscriptionIds = (env = process.env) =>
  (env.FCC_DENY_SUBSCRIPTION_IDS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Returns a reason string if the target looks like a protected (non-FCC) workload, else "". */
export function deniedTarget({ subscriptionId = "", subscriptionName = "", resourceGroup = "", webApp = "" }, env = process.env) {
  if (subscriptionId && denySubscriptionIds(env).includes(subscriptionId.toLowerCase())) return `subscription ${subscriptionId} is on the FCC_DENY_SUBSCRIPTION_IDS list`;
  for (const [label, value] of [["subscription name", subscriptionName], ["resource group", resourceGroup], ["web app", webApp]]) {
    if (value && DENY_NAME_PATTERN.test(value)) return `${label} "${value}" matches the protected FinThrive pilot pattern`;
  }
  return "";
}

export const hasWorkloadTag = (tags) => !!tags && tags[WORKLOAD_TAG] === WORKLOAD_TAG_VALUE;
