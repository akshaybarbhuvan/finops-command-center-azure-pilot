#!/usr/bin/env node
// READ-ONLY preflight for the pilot infrastructure deployment (docs/DEPLOYMENT.md step 5). Creates, changes and
// grants nothing: it only runs `az account show`, `az provider show`, `az group show` and `az deployment group what-if`.
// Every target is explicit; the script never relies on, or changes, the Azure CLI's default subscription.
//
//   npm run preflight:azure -- --tenant <tenant-id> --subscription <hosting-subscription-id> \
//     --resource-group <rg> --location <region> --parameters infra/main.parameters.json [--what-if-out <file>]
//   npm run preflight:azure -- ... --params-only     validate the parameters file only (no Azure calls)
//
// Exit 0 = GO for human review of the what-if output (it never deploys). Exit 1 = STOP, with the reasons listed.
// Protected workloads: FCC_DENY_SUBSCRIPTION_IDS (comma separated) and any name matching the FinThrive pattern are refused.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { REQUIRED_PROVIDERS, WORKLOAD_TAG, WORKLOAD_TAG_VALUE, deniedTarget, hasWorkloadTag, isGuid, isNamePrefix, isResourceGroupName } from "./lib/azure-target.mjs";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? "") : undefined;
};
const opts = {
  tenant: arg("tenant"),
  subscription: arg("subscription"),
  resourceGroup: arg("resource-group"),
  location: arg("location"),
  parameters: arg("parameters"),
  template: arg("template") ?? "infra/main.bicep",
  whatIfOut: arg("what-if-out") ?? "fcc-preflight-what-if.json",
  paramsOnly: argv.includes("--params-only"),
};

const stops = [];
const reviews = [];
const stop = (m) => stops.push(m);
const pass = (m) => console.log(`  ✓ ${m}`);
const done = () => {
  for (const m of reviews) console.log(`  ! REVIEW: ${m}`);
  for (const m of stops) console.log(`  ✗ STOP: ${m}`);
  if (stops.length) {
    console.log(`\nSTOP — ${stops.length} blocking issue(s). Do not deploy.`);
    process.exit(1);
  }
  console.log(opts.paramsOnly ? "\nGO — parameters file is valid (no Azure checks were run)." : `\nGO for human review — read the what-if output (${opts.whatIfOut}) and approve it before running \`az deployment group create\`. Nothing was deployed.`);
  process.exit(0);
};

const az = (args) => {
  const r = spawnSync("az", [...args, "--only-show-errors"], { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
  if (r.error) return { ok: false, detail: `could not run az (${r.error.code ?? r.error.message}); install the Azure CLI` };
  if (r.status !== 0) return { ok: false, detail: `${r.stderr ?? ""}`.trim().split("\n").slice(-3).join(" | ") || `az exited ${r.status}` };
  return { ok: true, out: r.stdout ?? "" };
};
const azJson = (args) => {
  const r = az([...args, "-o", "json"]);
  if (!r.ok) return r;
  try {
    return { ok: true, value: JSON.parse(r.out) };
  } catch {
    return { ok: false, detail: "az returned output that is not JSON" };
  }
};

console.log("\nFinOps Command Center — Azure infrastructure preflight (read-only)\n");

// 1. Explicit inputs
const required = opts.paramsOnly ? ["parameters"] : ["tenant", "subscription", "resource-group", "location", "parameters"];
for (const k of required) if (!arg(k)) stop(`--${k} is required (no defaults: the target must be stated explicitly).`);
if (opts.tenant && !isGuid(opts.tenant)) stop("--tenant must be a GUID.");
if (opts.subscription && !isGuid(opts.subscription)) stop("--subscription must be a subscription ID (GUID), not a name.");
if (opts.resourceGroup && !isResourceGroupName(opts.resourceGroup)) stop("--resource-group is not a valid resource group name.");
if (opts.location && !/^[a-z0-9]+$/.test(opts.location)) stop("--location must be an Azure region name such as westeurope (lowercase, no spaces).");
const denied = deniedTarget({ subscriptionId: opts.subscription ?? "", resourceGroup: opts.resourceGroup ?? "" });
if (denied) stop(`Protected target: ${denied}.`);
if (stops.length) done();

// 2. Parameters file (offline)
let params = {};
if (!existsSync(opts.parameters)) stop(`Parameters file ${opts.parameters} does not exist. Copy infra/main.parameters.example.json and fill it in.`);
else {
  try {
    params = JSON.parse(readFileSync(opts.parameters, "utf8")).parameters ?? {};
  } catch (e) {
    stop(`Parameters file ${opts.parameters} is not valid JSON (${e.message}).`);
  }
}
const p = (k) => params[k]?.value;
const placeholders = Object.entries(params).filter(([, v]) => JSON.stringify(v?.value ?? "").includes("<")).map(([k]) => k);
const budgetOn = p("deployBudget") === true;
for (const k of placeholders) if (k !== "budgetStartDate" || budgetOn) stop(`Parameter ${k} still contains a <placeholder>.`);
if (Object.keys(params).length) {
  if (!isNamePrefix(p("namePrefix"))) stop("namePrefix must be 3-16 characters: lowercase letters, digits and single hyphens, starting with a letter (it is used in Key Vault, SQL server and web app names).");
  for (const k of ["tenantId", "entraClientId", "sqlAdminGroupObjectId"]) if (!isGuid(p(k))) stop(`Parameter ${k} must be a GUID.`);
  if (!p("sqlAdminGroupName")) stop("Parameter sqlAdminGroupName is required.");
  const subs = `${p("approvedSubscriptionIds") ?? ""}`.split(",").map((s) => s.trim()).filter(Boolean);
  if (!subs.length || subs.length > 25 || !subs.every(isGuid)) stop("approvedSubscriptionIds must be 1-25 comma-separated subscription IDs (GUIDs).");
  for (const s of subs) {
    const d = deniedTarget({ subscriptionId: s });
    if (d) stop(`approvedSubscriptionIds: ${d}.`);
  }
  if (opts.tenant && isGuid(p("tenantId")) && p("tenantId").toLowerCase() !== opts.tenant.toLowerCase()) stop("Parameter tenantId does not match --tenant.");
  if (p("location") && opts.location && p("location") !== opts.location) stop("Parameter location does not match --location.");
  if (budgetOn && !/^\d{4}-\d{2}-01$/.test(`${p("budgetStartDate") ?? ""}`)) stop("deployBudget is true: budgetStartDate must be the first day of a month (YYYY-MM-01).");
  if (budgetOn && !(Array.isArray(p("budgetContactEmails")) && p("budgetContactEmails").length)) reviews.push("deployBudget is true but budgetContactEmails is empty: nobody will be notified.");
  if (p("assignKeyVaultRole") !== false) reviews.push("assignKeyVaultRole is true (default): the deployer needs User Access Administrator or Role Based Access Control Administrator on the resource group, because the template grants the web app identity Key Vault Secrets User.");
  if (p("sqlAllowAzureServices") !== false) reviews.push("sqlAllowAzureServices is true (default): the SQL firewall admits connections from any Azure-hosted client (Entra-only authentication still applies). Accepted pilot risk D5; see docs/SECURITY.md.");
  if (!stops.length) pass(`Parameters file ${opts.parameters}: required values present and well-formed (${subs.length} approved subscription(s))`);
}
if (opts.paramsOnly || stops.length) done();

// 3. Signed-in context, without changing the CLI default subscription
const account = azJson(["account", "show", "--subscription", opts.subscription]);
if (!account.ok) {
  stop(`Cannot read subscription ${opts.subscription} with the signed-in account (${account.detail}). Run \`az login --tenant ${opts.tenant}\` with an account that can see it.`);
  done();
}
const a = account.value;
if (`${a.tenantId}`.toLowerCase() !== opts.tenant.toLowerCase()) stop(`Subscription ${opts.subscription} belongs to a different tenant than --tenant.`);
if (a.state && a.state !== "Enabled") stop(`Subscription state is ${a.state}, not Enabled.`);
const deniedSub = deniedTarget({ subscriptionId: a.id, subscriptionName: a.name });
if (deniedSub) stop(`Protected target: ${deniedSub}.`);
if (stops.length) done();
pass(`Signed in as ${a.user?.name ?? "unknown user"}; target subscription "${a.name}" (${a.id}) in tenant ${a.tenantId}`);

// 4. Resource providers
const missing = [];
for (const ns of REQUIRED_PROVIDERS) {
  const r = az(["provider", "show", "--namespace", ns, "--subscription", opts.subscription, "--query", "registrationState", "-o", "tsv"]);
  if (!r.ok) stop(`Cannot read provider ${ns} (${r.detail}).`);
  else if (r.out.trim() !== "Registered") missing.push(`${ns} (${r.out.trim() || "unknown"})`);
}
if (missing.length) stop(`Resource providers not registered: ${missing.join(", ")}. A subscription Contributor registers each with \`az provider register --namespace <ns> --subscription ${opts.subscription}\` after approval.`);
else pass(`Resource providers registered: ${REQUIRED_PROVIDERS.join(", ")}`);

// 5. Resource group: must exist, be in the stated region and carry the FCC workload tag
const rg = azJson(["group", "show", "--name", opts.resourceGroup, "--subscription", opts.subscription]);
if (!rg.ok) {
  stop(`Resource group ${opts.resourceGroup} was not found (${rg.detail}). After approval create it with: az group create --subscription ${opts.subscription} --name ${opts.resourceGroup} --location ${opts.location} --tags ${WORKLOAD_TAG}=${WORKLOAD_TAG_VALUE}`);
  done();
}
if (rg.value.location !== opts.location) stop(`Resource group ${opts.resourceGroup} is in ${rg.value.location}, not ${opts.location}.`);
if (!hasWorkloadTag(rg.value.tags)) stop(`Resource group ${opts.resourceGroup} does not carry the tag ${WORKLOAD_TAG}=${WORKLOAD_TAG_VALUE}. It may belong to another workload; use a dedicated resource group created with that tag.`);
if (stops.length) done();
pass(`Resource group ${opts.resourceGroup} exists in ${opts.location} and is tagged ${WORKLOAD_TAG}=${WORKLOAD_TAG_VALUE}`);

// 6. What-if (read-only preview). Deletions or changes outside the resource group are blocking.
const wi = azJson(["deployment", "group", "what-if", "--subscription", opts.subscription, "--resource-group", opts.resourceGroup, "--template-file", opts.template, "--parameters", `@${opts.parameters}`, "--no-pretty-print"]);
if (!wi.ok) {
  stop(`what-if failed (${wi.detail}). Common causes: missing permission (Contributor on the resource group), quota or regional capacity (for example "not accepting creation of new ... servers" or "SubscriptionIsOverQuotaForSku": choose another region or SKU), or an invalid parameter.`);
  done();
}
writeFileSync(opts.whatIfOut, JSON.stringify(wi.value, null, 2));
const changes = wi.value.changes ?? [];
const rgScope = `/subscriptions/${opts.subscription}/resourceGroups/${opts.resourceGroup}/`.toLowerCase();
const counts = {};
for (const c of changes) {
  counts[c.changeType] = (counts[c.changeType] ?? 0) + 1;
  const id = `${c.resourceId ?? ""}`;
  if (!id.toLowerCase().startsWith(rgScope)) stop(`what-if: ${c.changeType} outside the pilot resource group: ${id}`);
  else if (c.changeType === "Delete") stop(`what-if: deletion of ${id}`);
  else if (c.changeType === "Modify") reviews.push(`what-if: modification of ${id}`);
}
pass(`what-if: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "no changes"}; full output saved to ${opts.whatIfOut}`);
done();
