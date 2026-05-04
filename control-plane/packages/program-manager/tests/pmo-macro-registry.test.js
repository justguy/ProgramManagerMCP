import test from "node:test";
import assert from "node:assert/strict";

import {
  PMO_MACRO_OPERATOR_ROLE,
  PMO_MACRO_REGISTRY_ADMIN_ROLE,
  applyAndPersistMacroRegistryEdit,
  applyMacroRegistryEdit,
  createBuiltInMacroRegistry
} from "../src/macros/pmo-macro-registry.ts";
import { InMemoryProgramManagerRepository } from "../src/repository/in-memory-program-manager-repository.ts";

test("built-in PMO macro registry contains safe sorted macro entries", () => {
  const registry = createBuiltInMacroRegistry(
    "portfolio://default",
    "2026-05-04T06:00:00Z"
  );

  assert.deepEqual(
    registry.macros.map((entry) => entry.macroName),
    [
      "analyze_blockers",
      "catch_me_up",
      "describe_macro",
      "detect_drift",
      "discover_macros",
      "export_registry",
      "object_type_docs",
      "propose_unblock_plan",
      "registry_help",
      "simulate_impact",
      "validate_macro"
    ]
  );
  assert.equal(
    registry.macros.every(
      (entry) =>
        entry.sideEffectPosture === "read_only" ||
        entry.sideEffectPosture === "describes_actions_only"
    ),
    true
  );
  assert.equal(
    registry.macros.every((entry) => entry.requiredRoleRefs.includes(PMO_MACRO_OPERATOR_ROLE)),
    true
  );
});

test("macro registry edit accepts safe fields and stores only PMO internal config mutations", () => {
  const registry = createBuiltInMacroRegistry(
    "portfolio://default",
    "2026-05-04T06:00:00Z"
  );

  const result = applyMacroRegistryEdit(
    registry,
    {
      macroId: "macro://pmo/catch_me_up",
      set: {
        description: "Return a concise PMO context packet.",
        enabled: false,
        requiredRoleRefs: ["role://pmo/macro-operator", "role://pmo/context-reader"],
        title: "Catch Me Up Fast"
      }
    },
    {
      actorId: "actor://codex/pmo",
      portfolioIds: ["portfolio://default"],
      roleRefs: [PMO_MACRO_REGISTRY_ADMIN_ROLE]
    },
    "2026-05-04T06:10:00Z"
  );

  assert.equal(result.accepted, true);
  assert.equal(result.auditEvent.eventType, "pmo_macro.edit_registry.accepted");
  const edited = result.registry.macros.find((entry) => entry.macroId === "macro://pmo/catch_me_up");
  assert.equal(edited.title, "Catch Me Up Fast");
  assert.equal(edited.enabled, false);
  assert.deepEqual(edited.requiredRoleRefs, [
    "role://pmo/context-reader",
    "role://pmo/macro-operator"
  ]);
  assert.equal(edited.sideEffectPosture, "read_only");
  assert.equal(edited.inputSchemaRef, "schema://pmo/pmo-macro-request");
});

test("macro registry edit rejects unauthorized and unsafe authority changes deterministically", () => {
  const registry = createBuiltInMacroRegistry(
    "portfolio://default",
    "2026-05-04T06:00:00Z"
  );
  const actor = {
    actorId: "actor://codex/pmo",
    portfolioIds: ["portfolio://default"],
    roleRefs: [PMO_MACRO_REGISTRY_ADMIN_ROLE]
  };

  const unauthorized = applyMacroRegistryEdit(
    registry,
    {
      macroId: "macro://pmo/catch_me_up",
      set: {
        title: "Unauthorized"
      }
    },
    {
      ...actor,
      roleRefs: ["role://pmo/macro-operator"]
    },
    "2026-05-04T06:10:00Z"
  );
  assert.equal(unauthorized.accepted, false);
  assert.equal(unauthorized.errorCode, "macro-registry-edit-unauthorized");
  assert.equal(unauthorized.auditEvent.eventType, "pmo_macro.edit_registry.rejected");

  const lockedField = applyMacroRegistryEdit(
    registry,
    {
      macroId: "macro://pmo/catch_me_up",
      set: {
        sideEffectPosture: "pmo_internal_write"
      }
    },
    actor,
    "2026-05-04T06:11:00Z"
  );
  assert.equal(lockedField.accepted, false);
  assert.equal(lockedField.errorCode, "macro-registry-edit-locked-field");

  const downstreamAuthority = applyMacroRegistryEdit(
    registry,
    {
      macroId: "macro://pmo/catch_me_up",
      set: {
        requiredRoleRefs: ["role://github/mutate"]
      }
    },
    actor,
    "2026-05-04T06:12:00Z"
  );
  assert.equal(downstreamAuthority.accepted, false);
  assert.equal(downstreamAuthority.errorCode, "macro-registry-edit-downstream-authority-denied");
});

test("macro registry edit path persists accepted edits only in the PMO repository", async () => {
  const repository = InMemoryProgramManagerRepository.fromFixture({});
  const actor = {
    actorId: "actor://codex/pmo",
    portfolioIds: ["portfolio://default"],
    roleRefs: [PMO_MACRO_REGISTRY_ADMIN_ROLE]
  };

  const accepted = await applyAndPersistMacroRegistryEdit(
    repository,
    "portfolio://default",
    {
      macroId: "macro://pmo/registry_help",
      set: {
        title: "Safe Registry Help"
      }
    },
    actor,
    "2026-05-04T06:15:00Z"
  );

  assert.equal(accepted.accepted, true);
  assert.equal(
    (await repository.getMacroRegistry({ portfolioId: "portfolio://default" })).macros.find(
      (entry) => entry.macroId === "macro://pmo/registry_help"
    ).title,
    "Safe Registry Help"
  );
  assert.deepEqual(
    (await repository.listEvents({ portfolioId: "portfolio://default" })).map((event) => event.eventType),
    ["pmo_macro.edit_registry.accepted"]
  );

  const rejected = await applyAndPersistMacroRegistryEdit(
    repository,
    "portfolio://default",
    {
      macroId: "macro://pmo/registry_help",
      set: {
        outputSchemaRef: "schema://downstream/mutating-tool"
      }
    },
    actor,
    "2026-05-04T06:16:00Z"
  );

  assert.equal(rejected.accepted, false);
  assert.equal(
    (await repository.getMacroRegistry({ portfolioId: "portfolio://default" })).macros.find(
      (entry) => entry.macroId === "macro://pmo/registry_help"
    ).outputSchemaRef,
    "schema://pmo/pmo-macro-result"
  );
});
