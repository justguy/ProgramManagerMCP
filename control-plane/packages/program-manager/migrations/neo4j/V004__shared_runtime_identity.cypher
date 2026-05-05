CREATE CONSTRAINT pm_system_identity_key IF NOT EXISTS
FOR (identity:PmSystemIdentity)
REQUIRE identity.identityKey IS UNIQUE;
