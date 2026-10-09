// Grants the FCC web app's managed identity READ-ONLY access to ONE approved subscription.
// Deploy once per approved subscription, by someone with Owner or User Access Administrator on that subscription,
// after reviewing the what-if output. Nothing else is granted; no write roles are assigned.
//   Reader                   -> Azure Resource Graph inventory and Azure Advisor recommendations
//   Cost Management Reader   -> Azure Cost Management query API (EA: "AO view charges" must be enabled;
//                               MCA: the billing-profile "Azure charges" policy must allow subscription users)
targetScope = 'subscription'

@description('Object ID of the FCC web app system-assigned managed identity (output webAppPrincipalId of main.bicep).')
param principalId string

var reader = 'acdd72a7-3385-48ef-bd42-f606fba81ae7'
var costManagementReader = '72fafb9e-0641-4937-9268-a91bfd8191a3'

resource readerAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, principalId, reader)
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', reader)
    description: 'FinOps Command Center pilot: read-only inventory and Advisor access'
  }
}

resource costReaderAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(subscription().id, principalId, costManagementReader)
  properties: {
    principalId: principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', costManagementReader)
    description: 'FinOps Command Center pilot: read-only cost data access'
  }
}
