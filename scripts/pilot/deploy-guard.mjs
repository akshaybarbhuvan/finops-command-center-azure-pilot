#!/usr/bin/env node
// Fail-closed gates for .github/workflows/deploy-pilot.yml. Each mode exits non-zero with a GitHub ::error:: annotation
// that says exactly what to fix. Values that identify the tenant or subscription are never printed.
//   node scripts/pilot/deploy-guard.mjs dispatch   CONFIRM must be exactly DEPLOY and REF must be refs/heads/main
//   node scripts/pilot/deploy-guard.mjs config     the five GitHub variables are present and well-formed
//   node scripts/pilot/deploy-guard.mjs target     (after azure/login) signed-in tenant/subscription match the variables,
//                                                  the web app exists, carries the FCC workload tag and is not denied;
//                                                  writes its real default host name to $GITHUB_OUTPUT as `hostname`
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { WORKLOAD_TAG, WORKLOAD_TAG_VALUE, deniedTarget, hasWorkloadTag, isGuid, isResourceGroupName, isWebAppName } from "./lib/azure-target.mjs";

const env = process.env;
const errors = [];
const error = (msg) => errors.push(msg);
const finish = (okMessage) => {
  if (errors.length) {
    for (const e of errors) console.log(`::error::${e}`);
    process.exit(1);
  }
  console.log(okMessage);
  process.exit(0);
};

const az = (args) => {
  const r = spawnSync("az", [...args, "--only-show-errors", "-o", "json"], { encoding: "utf8", shell: process.platform === "win32" });
  if (r.error) return { ok: false, detail: `could not run az: ${r.error.message}` };
  if (r.status !== 0) return { ok: false, detail: `${r.stderr ?? ""}`.trim().split("\n").slice(-3).join(" | ") || `az exited ${r.status}` };
  try {
    return { ok: true, value: JSON.parse(r.stdout) };
  } catch {
    return { ok: false, detail: "az returned output that is not JSON" };
  }
};

const VARS = {
  AZURE_CLIENT_ID: { check: isGuid, hint: "the client ID (GUID) of the GitHub OIDC deployment identity" },
  AZURE_TENANT_ID: { check: isGuid, hint: "the Microsoft Entra tenant ID (GUID)" },
  AZURE_SUBSCRIPTION_ID: { check: isGuid, hint: "the hosting subscription ID (GUID)" },
  PILOT_RESOURCE_GROUP: { check: isResourceGroupName, hint: "the pilot resource group name" },
  PILOT_WEBAPP_NAME: { check: isWebAppName, hint: "the webAppName output of infra/main.bicep" },
};

const mode = process.argv[2];

if (mode === "dispatch") {
  if (env.CONFIRM !== "DEPLOY") error(`Deployment not confirmed: the "confirm" input must be exactly DEPLOY (case-sensitive, no spaces). Nothing was built or deployed.`);
  if (env.REF !== "refs/heads/main") error(`Only main can be deployed; this run is for ${env.REF || "an unknown ref"}. Re-run the workflow from the main branch.`);
  finish("Dispatch gate passed: confirmed DEPLOY on refs/heads/main.");
} else if (mode === "config") {
  for (const [name, { check, hint }] of Object.entries(VARS)) {
    const value = env[name];
    if (!value || !value.trim()) error(`GitHub variable ${name} is not set. Set it to ${hint} under Settings → Environments → pilot → Environment variables (or repository variables).`);
    else if (!check(value.trim())) error(`GitHub variable ${name} is not a valid value (expected ${hint}).`);
  }
  const denied = deniedTarget({ subscriptionId: env.AZURE_SUBSCRIPTION_ID, resourceGroup: env.PILOT_RESOURCE_GROUP, webApp: env.PILOT_WEBAPP_NAME });
  if (denied) error(`Refusing to deploy: ${denied}.`);
  finish("Configuration gate passed: all five deployment variables are present and well-formed.");
} else if (mode === "target") {
  const account = az(["account", "show"]);
  if (!account.ok) {
    error(`Could not read the signed-in Azure context (${account.detail}). Check the azure/login step and the OIDC federated credential.`);
    finish("");
  }
  const a = account.value;
  if (`${a.tenantId}`.toLowerCase() !== `${env.AZURE_TENANT_ID}`.toLowerCase()) error("Signed-in tenant does not match AZURE_TENANT_ID.");
  if (`${a.id}`.toLowerCase() !== `${env.AZURE_SUBSCRIPTION_ID}`.toLowerCase()) error("Signed-in subscription does not match AZURE_SUBSCRIPTION_ID.");
  const denied = deniedTarget({ subscriptionId: a.id, subscriptionName: a.name, resourceGroup: env.PILOT_RESOURCE_GROUP, webApp: env.PILOT_WEBAPP_NAME });
  if (denied) error(`Refusing to deploy: ${denied}.`);
  if (errors.length) finish("");

  const site = az(["webapp", "show", "--resource-group", env.PILOT_RESOURCE_GROUP, "--name", env.PILOT_WEBAPP_NAME]);
  if (!site.ok) {
    error(`Web app ${env.PILOT_WEBAPP_NAME} was not found in resource group ${env.PILOT_RESOURCE_GROUP}, or the deployment identity cannot read it (${site.detail}). Deploy infra/main.bicep first and grant the identity Website Contributor on the web app.`);
    finish("");
  }
  const s = site.value;
  if (!hasWorkloadTag(s.tags)) error(`Web app ${env.PILOT_WEBAPP_NAME} does not carry the tag ${WORKLOAD_TAG}=${WORKLOAD_TAG_VALUE}, so it is not a resource created by infra/main.bicep. Refusing to deploy. Re-deploy infra/main.bicep (it adds the tag) or correct PILOT_WEBAPP_NAME.`);
  const host = s.defaultHostName;
  if (!host || !/^[a-z0-9.-]+$/i.test(host)) error(`Web app ${env.PILOT_WEBAPP_NAME} reports no usable default host name.`);
  // FCC_PUBLIC_ORIGIN drives the CSRF origin check; if it is not one of the app's real host names every change is rejected.
  // Only that one setting is read and printed; other app settings are never logged.
  const settings = az(["webapp", "config", "appsettings", "list", "--resource-group", env.PILOT_RESOURCE_GROUP, "--name", env.PILOT_WEBAPP_NAME, "--query", "[?name=='FCC_PUBLIC_ORIGIN'].value | [0]"]);
  if (!settings.ok) error(`Could not read FCC_PUBLIC_ORIGIN from the web app settings (${settings.detail}).`);
  else {
    let originHost = "";
    try {
      originHost = new URL(`${settings.value ?? ""}`).host.toLowerCase();
    } catch {
      /* reported below */
    }
    const hostNames = (s.hostNames ?? [host]).map((h) => `${h}`.toLowerCase());
    if (!originHost || !hostNames.includes(originHost)) error(`FCC_PUBLIC_ORIGIN (${settings.value || "unset"}) is not a host name of ${env.PILOT_WEBAPP_NAME} (${hostNames.join(", ")}). Set the Bicep parameter publicOrigin to https://${host} (or the custom domain) and re-deploy the infrastructure; otherwise every change is rejected as cross-site.`);
  }
  if (s.httpsOnly !== true) error(`Web app ${env.PILOT_WEBAPP_NAME} is not HTTPS-only; infra/main.bicep sets httpsOnly=true. Re-deploy the infrastructure before deploying the application.`);
  if (!errors.length && env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `hostname=${host}\n`);
  finish(`Target gate passed: ${env.PILOT_WEBAPP_NAME} (${host}) in ${env.PILOT_RESOURCE_GROUP}, tagged ${WORKLOAD_TAG}=${WORKLOAD_TAG_VALUE}.`);
} else {
  console.log("::error::Usage: deploy-guard.mjs dispatch|config|target");
  process.exit(2);
}
