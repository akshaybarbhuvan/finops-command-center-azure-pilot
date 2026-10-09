// FinOps Command Center — single-organization Azure pilot (resource-group scope).
// Creates: Log Analytics + Application Insights, Key Vault (RBAC), Linux App Service plan + Web App (system-assigned
// managed identity, App Service Authentication with Microsoft Entra ID), Azure SQL logical server (Entra-only
// authentication) + database, diagnostic settings, and optionally a resource-group budget.
// Does NOT grant the app access to any subscription's cost/inventory data: see subscription-reader-access.bicep.
// Contains no tenant IDs, subscription IDs, names of real organizations or secrets; all are parameters.
targetScope = 'resourceGroup'

@description('Azure region for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Short prefix for resource names, e.g. fcc-pilot: lowercase letters, digits and single hyphens, starting with a letter (used in Key Vault, SQL server and web app names). Checked by npm run preflight:azure.')
@minLength(3)
@maxLength(16)
param namePrefix string

@description('Microsoft Entra tenant ID of the pilot organization (sign-in is restricted to this tenant).')
param tenantId string

@description('Application (client) ID of the Entra app registration used for App Service Authentication.')
param entraClientId string

@description('Comma-separated subscription IDs approved for the pilot. Read-only access is granted separately per subscription.')
param approvedSubscriptionIds string

@description('Object ID of the Entra group that administers the Azure SQL server (database operators / migration runners).')
param sqlAdminGroupObjectId string

@description('Display name of that Entra group.')
param sqlAdminGroupName string

@description('App Service plan SKU. B1 is the smallest that supports Always On (needed for scheduled refresh).')
@allowed([ 'B1', 'B2', 'P0v3', 'P1v3' ])
param appServiceSku string = 'B1'

@description('Azure SQL database SKU name (DTU or vCore).')
param sqlSkuName string = 'S0'

@description('Short-term backup retention for point-in-time restore, in days.')
@minValue(1)
@maxValue(35)
param sqlBackupRetentionDays int = 7

@description('Allow Azure services (including this App Service) through the SQL firewall. Required unless private networking is added. See docs/SECURITY.md.')
param sqlAllowAzureServices bool = true

@description('Minutes between scheduled refreshes (0 disables; minimum 60).')
param syncIntervalMinutes int = 360

@description('Advisor categories to ingest (comma separated).')
param advisorCategories string = 'Cost'

@description('Public https origin users browse to when a custom domain is used, e.g. https://fcc.contoso.com. Leave empty to use the default host name that Azure assigns to the web app (read from the deployed site, not built from its name). Must match exactly, or every change is rejected as cross-site.')
param publicOrigin string = ''

@description('Display label shown in the header (generic; do not include confidential names unless approved).')
param orgLabel string = 'Azure pilot'

@description('Grant the web app identity "Key Vault Secrets User" on the vault (requires roleAssignments/write for the deployer).')
param assignKeyVaultRole bool = true

@description('Create a monthly cost budget for this resource group.')
param deployBudget bool = false

@description('Monthly budget amount in the billing currency.')
param budgetAmount int = 200

@description('Budget start date (first day of a month, YYYY-MM-01).')
param budgetStartDate string = ''

@description('Email addresses notified at 80% and 100% of the budget.')
param budgetContactEmails array = []

@description('Log Analytics retention in days.')
param logRetentionDays int = 30

@description('Additional tags for every taggable resource (e.g. cost center, owner). The fcc-workload tag is always set.')
param tags object = {}

// deploy-pilot.yml and npm run preflight:azure refuse targets without this tag (protects other workloads).
var resourceTags = union(tags, { 'fcc-workload': 'finops-command-center-azure-pilot' })

var suffix = uniqueString(resourceGroup().id)
var names = {
  logs: '${namePrefix}-logs'
  insights: '${namePrefix}-ai'
  vault: take('${replace(namePrefix, '-', '')}kv${suffix}', 24)
  plan: '${namePrefix}-plan'
  site: '${namePrefix}-${suffix}'
  sql: '${namePrefix}-sql-${suffix}'
  db: 'fcc'
}
var keyVaultSecretsUser = '4633458b-17de-408a-b874-0445c86b69e6'
var entraSecretName = 'entra-auth-client-secret'

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: names.logs
  location: location
  tags: resourceTags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: logRetentionDays
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: names.insights
  location: location
  tags: resourceTags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logs.id
    DisableLocalAuth: false
  }
}

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: names.vault
  location: location
  tags: resourceTags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: names.plan
  location: location
  tags: resourceTags
  kind: 'linux'
  sku: { name: appServiceSku }
  properties: { reserved: true }
}

resource sql 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: names.sql
  location: location
  tags: resourceTags
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: true
      login: sqlAdminGroupName
      sid: sqlAdminGroupObjectId
      tenantId: subscription().tenantId
      principalType: 'Group'
    }
  }
}

resource sqlAllowAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = if (sqlAllowAzureServices) {
  parent: sql
  name: 'AllowAllWindowsAzureIps'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource sqlAuditing 'Microsoft.Sql/servers/auditingSettings@2023-08-01-preview' = {
  parent: sql
  name: 'default'
  properties: {
    state: 'Enabled'
    isAzureMonitorTargetEnabled: true
  }
}

resource db 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sql
  name: names.db
  location: location
  tags: resourceTags
  sku: { name: sqlSkuName }
  properties: {
    requestedBackupStorageRedundancy: 'Local'
  }
}

resource dbRetention 'Microsoft.Sql/servers/databases/backupShortTermRetentionPolicies@2023-08-01-preview' = {
  parent: db
  name: 'default'
  properties: { retentionDays: sqlBackupRetentionDays }
}

resource masterDb 'Microsoft.Sql/servers/databases@2023-08-01-preview' existing = {
  parent: sql
  name: 'master'
}

resource sqlAuditDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: masterDb
  name: 'audit-to-log-analytics'
  properties: {
    workspaceId: logs.id
    logs: [ { category: 'SQLSecurityAuditEvents', enabled: true } ]
  }
  dependsOn: [ sqlAuditing ]
}

resource site 'Microsoft.Web/sites@2023-12-01' = {
  name: names.site
  location: location
  tags: resourceTags
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'node server.js'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
      http20Enabled: true
      healthCheckPath: '/api/health'
      remoteDebuggingEnabled: false
    }
  }
}

// App settings live in a child resource (not siteConfig.appSettings) so FCC_PUBLIC_ORIGIN can use the default host
// name Azure actually assigned. Depending on the subscription and region that is <name>.azurewebsites.net or a unique
// <name>-<hash>.<region>-01.azurewebsites.net, so it is never built from the site name. This resource is the complete set.
var effectivePublicOrigin = empty(publicOrigin) ? 'https://${site.properties.defaultHostName}' : publicOrigin

resource siteAppSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: site
  name: 'appsettings'
  properties: {
    APP_MODE: 'pilot'
    FCC_BUILD_TARGET: 'pilot'
    NODE_ENV: 'production'
    FCC_AUTH_MODE: 'appservice'
    FCC_ENTRA_TENANT_ID: tenantId
    FCC_AZURE_SUBSCRIPTION_IDS: approvedSubscriptionIds
    FCC_PUBLIC_ORIGIN: effectivePublicOrigin
    FCC_ORG_LABEL: orgLabel
    FCC_DB_DIALECT: 'mssql'
    FCC_SQL_SERVER: '${names.sql}${environment().suffixes.sqlServerHostname}'
    FCC_SQL_DATABASE: names.db
    FCC_ADVISOR_CATEGORIES: advisorCategories
    FCC_SYNC_INTERVAL_MINUTES: string(syncIntervalMinutes)
    APPLICATIONINSIGHTS_CONNECTION_STRING: insights.properties.ConnectionString
    ApplicationInsightsAgent_EXTENSION_VERSION: '~3'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    NEXT_TELEMETRY_DISABLED: '1'
    // The Entra client secret for App Service Authentication is stored ONLY in Key Vault (set by an administrator).
    MICROSOFT_PROVIDER_AUTHENTICATION_SECRET: '@Microsoft.KeyVault(VaultName=${names.vault};SecretName=${entraSecretName})'
  }
}

resource scmCredentials 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: site
  name: 'scm'
  properties: { allow: false }
}

resource ftpCredentials 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2023-12-01' = {
  parent: site
  name: 'ftp'
  properties: { allow: false }
}

resource auth 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: site
  name: 'authsettingsV2'
  dependsOn: [ siteAppSettings ]
  properties: {
    platform: { enabled: true }
    globalValidation: {
      requireAuthentication: true
      unauthenticatedClientAction: 'RedirectToLoginPage'
      redirectToProvider: 'azureactivedirectory'
      excludedPaths: [ '/api/health' ]
    }
    httpSettings: {
      requireHttps: true
      forwardProxy: { convention: 'NoProxy' }
    }
    login: {
      tokenStore: { enabled: true }
      preserveUrlFragmentsForLogins: false
    }
    identityProviders: {
      azureActiveDirectory: {
        enabled: true
        registration: {
          openIdIssuer: '${environment().authentication.loginEndpoint}${tenantId}/v2.0'
          clientId: entraClientId
          clientSecretSettingName: 'MICROSOFT_PROVIDER_AUTHENTICATION_SECRET'
        }
        validation: {
          allowedAudiences: [ entraClientId, 'api://${entraClientId}' ]
        }
      }
    }
  }
}

resource vaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (assignKeyVaultRole) {
  name: guid(vault.id, site.id, keyVaultSecretsUser)
  scope: vault
  properties: {
    principalId: site.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUser)
  }
}

resource siteDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: site
  name: 'to-log-analytics'
  properties: {
    workspaceId: logs.id
    logs: [
      { category: 'AppServiceHTTPLogs', enabled: true }
      { category: 'AppServiceConsoleLogs', enabled: true }
      { category: 'AppServiceAppLogs', enabled: true }
      { category: 'AppServiceAuditLogs', enabled: true }
    ]
    metrics: [ { category: 'AllMetrics', enabled: true } ]
  }
}

resource vaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: vault
  name: 'to-log-analytics'
  properties: {
    workspaceId: logs.id
    logs: [ { category: 'AuditEvent', enabled: true } ]
  }
}

resource budget 'Microsoft.Consumption/budgets@2023-11-01' = if (deployBudget) {
  name: '${namePrefix}-monthly'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate }
    notifications: {
      actual80: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 80, contactEmails: budgetContactEmails, thresholdType: 'Actual' }
      actual100: { enabled: true, operator: 'GreaterThanOrEqualTo', threshold: 100, contactEmails: budgetContactEmails, thresholdType: 'Actual' }
    }
  }
}

@description('Web app name (deployment target).')
output webAppName string = site.name
@description('Public URL. Add <url>/.auth/login/aad/callback as a redirect URI on the Entra app registration.')
output webAppUrl string = 'https://${site.properties.defaultHostName}'
@description('FCC_PUBLIC_ORIGIN as configured. Must equal webAppUrl (or the custom domain); if App Service assigned a different default host name, set publicOrigin and redeploy (docs/DEPLOYMENT.md step 6).')
output publicOriginConfigured string = effectivePublicOrigin
@description('Object ID of the web app managed identity. Grant it read-only access per approved subscription with subscription-reader-access.bicep.')
output webAppPrincipalId string = site.identity.principalId
@description('Azure SQL server host name.')
output sqlServerFqdn string = sql.properties.fullyQualifiedDomainName
@description('Database name.')
output sqlDatabaseName string = db.name
@description('Key Vault name. An administrator stores the Entra client secret here as entra-auth-client-secret.')
output keyVaultName string = vault.name
