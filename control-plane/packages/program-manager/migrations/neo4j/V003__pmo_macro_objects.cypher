CREATE CONSTRAINT pm_macro_fact_ref IF NOT EXISTS
FOR (fact:PmMacroFact)
REQUIRE (fact.portfolioId, fact.ref) IS UNIQUE;

CREATE CONSTRAINT pm_macro_registry_ref IF NOT EXISTS
FOR (registry:PmMacroRegistry)
REQUIRE (registry.portfolioId, registry.registryRef) IS UNIQUE;

CREATE INDEX pm_macro_fact_scope IF NOT EXISTS
FOR (fact:PmMacroFact)
ON (fact.portfolioId, fact.programId, fact.projectId);

CREATE INDEX pm_macro_task_ref IF NOT EXISTS
FOR (task:PmMacroTask)
ON (task.ref);

CREATE INDEX pm_macro_blocker_ref IF NOT EXISTS
FOR (blocker:PmMacroBlocker)
ON (blocker.ref);

CREATE INDEX pm_macro_contract_ref IF NOT EXISTS
FOR (contract:PmMacroContract)
ON (contract.ref);

CREATE INDEX pm_macro_dependency_edge_ref IF NOT EXISTS
FOR (edge:PmMacroDependencyEdge)
ON (edge.ref);

CREATE INDEX pm_macro_runbook_ref IF NOT EXISTS
FOR (runbook:PmMacroRunbook)
ON (runbook.ref);

CREATE INDEX pm_macro_registry_version IF NOT EXISTS
FOR (registry:PmMacroRegistry)
ON (registry.registryVersion);
