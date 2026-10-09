-- Run ONCE against the FCC database (not master) by a member of the SQL Entra admin group,
-- AFTER `npm run db:migrate` has created the tables. Replace <WEB_APP_NAME> with the web app name
-- (output webAppName of infra/main.bicep): the managed identity's name equals the web app name.
-- Tools: Azure portal Query editor (signed in with Entra), Azure Data Studio, or sqlcmd with Entra auth.
--
-- Grants: read/write of application tables only. No DDL rights (migrations run separately with the admin group).
-- Append-only history: UPDATE and DELETE are denied on audit, history, evidence and verification tables.

CREATE USER [<WEB_APP_NAME>] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [<WEB_APP_NAME>];
ALTER ROLE db_datawriter ADD MEMBER [<WEB_APP_NAME>];

DENY UPDATE, DELETE ON dbo.audit_events  TO [<WEB_APP_NAME>];
DENY UPDATE, DELETE ON dbo.rec_events    TO [<WEB_APP_NAME>];
DENY UPDATE, DELETE ON dbo.evidence      TO [<WEB_APP_NAME>];
DENY UPDATE, DELETE ON dbo.verifications TO [<WEB_APP_NAME>];
DENY ALTER, CONTROL ON SCHEMA::dbo        TO [<WEB_APP_NAME>];

-- Verification (expect db_datareader and db_datawriter):
SELECT r.name AS role_name FROM sys.database_role_members m
JOIN sys.database_principals r ON r.principal_id = m.role_principal_id
JOIN sys.database_principals u ON u.principal_id = m.member_principal_id
WHERE u.name = '<WEB_APP_NAME>';
