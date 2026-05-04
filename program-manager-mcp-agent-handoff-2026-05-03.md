# Program Manager MCP Agent Handoff

Date: 2026-05-03
Status: planning handoff
Primary objective: implement an interim stateful Program Manager service with an MCP tool surface that can later become the Agentic OS PMO intelligence mcp-gateway.

## Executive Summary

Build **Program Manager MCP** as the stateful PMO memory, dependency intelligence, and audit/receipt ledger over standalone capabilities such as LLM Tracker, Hoplon, Serena, GitHub, Guardrail, Semantix, and future Agentic OS control-plane services.

Standalone MCPs must remain usable on their own. Program Manager adds enterprise PMO behavior only when a coordinated program needs it: durable cross-project memory, capability discovery, impact analysis, dependency propagation planning, progress updates, audit, tracing, evidence discipline, decisions, and program reports.

Program Manager is a passive analyst and ledger, not the executor. It calculates blast radius, names dependencies, identifies gaps, states required approvals/evidence, and records receipts from agentic execution. The LLM or specialized worker agents keep the execution keys to Hoplon, LLM Tracker, GitHub, Semantix, Guardrail, and other tools.

The interim version should be useful before the full Agentic OS is ready, but its schemas, database model, event model, and artifact model must be designed so the Agentic OS can later own the same contracts.

## Non-Negotiables

- Do not replace LLM Tracker, Hoplon, Serena, or other focused MCPs. They remain standalone capabilities.
- Do not expose every downstream tool through Program Manager. Expose a small macro-tool and discovery surface.
- Do not make the LLM remember propagation rules. Program Manager must infer affected projects, contracts, trackers, reports, and decision requests.
- Do not execute downstream mutations through Program Manager. PMO provides flight plans and receipt requirements; agentic executors perform the work with their own authorized tools.
- Do not use LLM Tracker as the only durable program memory. LLM Tracker is the operational task/blocker board; Program Manager owns program memory, decisions, integration points, dependency edges, evidence indexes, and action ledgers.
- Program Manager is stateful. It must have its own database-backed repository abstraction from the start. Implementation should be TypeScript with Neo4j as the primary cp-graph database for PMO memory and blast-radius traversal.
- Keep all program context refs-first. Do not inline raw logs, traces, screenshots, provider transcripts, product rows, secrets, credentials, session data, or scratchpads.
- External side effects stay in the agentic execution layer. Program Manager only mutates its own DB, artifact registry, cp-graph/projections, and generated reports.
- Every program action needs trace, correlation, actor, program, project, and evidence context.
- Propagation must be loop-safe and idempotent. Every propagated action/event needs ancestry, causation, and idempotency metadata so adapter-to-adapter feedback cannot recurse forever.
- Cross-tool execution is not a PMO transaction. Partial completion must be represented through missing, failed, or conflicting receipts and surfaced as reconcile/desynchronization findings.

## Existing Repo Context To Read First

- `AGENTS.md`: MCP/tool triage, Graphiti caveats, staged delivery, non-negotiables.
- `control-plane/AGENTS.md`: MCP output constraints, pointer-only context packets, mcp-gateway side-effect rules, audit/actor stamping.
- `artifacts/reports/implementation/mcp-gateway-mvp-2026-04-28.md`: current MCP mcp-gateway baseline.
- `artifacts/reports/implementation/gov-018-agent-context-builder-2026-04-28.md`: pointer-only context packet model.
- `artifacts/reports/implementation/gov-023-autonomous-tracker-factory-2026-04-29.md`: autonomous tracker factory, cp-graph linkage, evidence-gated tracker creation.
- `shared/schemas/agent-os.ts`: existing Agent OS shared zod contracts.
- `control-plane/mcp-gateway/`: existing mcp-gateway/adaptor ownership.
- `control-plane/packages/context/`: existing context projection package.
- `control-plane/packages/cp-graph/`: cp-graph node/relationship contracts and repository DDL alignment requirements.

## Naming

Recommended product/system name: **Program Manager**.

MCP server id: `cp-program-manager`.

Capability label in operator and agent-facing language: **PMO**.

Use **PMO** for the capability/service role in requirements, tool descriptions, findings, receipts, and reports. Keep `Program Manager` for the product/package name and `cp-program-manager` for server/package identifiers.

Reasoning: it coordinates standalone instruments without replacing them. It is more active than "Alignment Hub" and less overloaded than "Control Tower."

## Change Shape

- Contract change: new program, integration, adapter, impact, propagation, audit, and evidence DTOs.
- MCP mcp-gateway change: new macro-tool/discovery surface over the stateful Program Manager service.
- Data-layer change: add a Program Manager database-backed repository for memory, decisions, dependencies, artifacts, events, expected receipts, observed receipts, and action ledgers; reports remain generated artifacts, not the source of truth.
- Authz/audit change: every flight plan and receipt needs actor, scope, trace, evidence, and side-effect classification.
- Tracker integration change: Program Manager can read tracker state and propose tracker updates; execution agents perform tracker writes and report receipts back.
- Cross-project coordination change: changes in one capability/project must produce impact and propagation plans for dependent projects/tools.

## Affected Scopes

- `shared/schemas/`: add reusable zod contracts for Program Manager DTOs. These must stay isomorphic.
- `control-plane/mcp-gateway/`: likely owner for the MCP facade and adapter registry.
- `control-plane/packages/context/`: later consumer for cp-program-manager context packets.
- `control-plane/packages/cp-graph/`: later owner or mirror for durable cp-graph nodes and relationship types.
- `control-plane/src/`: composition root exports only; avoid product app/server imports.
- `.llm-tracker/`: source of task/status truth for project execution boards, plus optional program-alignment tracker; not the canonical program memory store.
- `artifacts/reports/alignment/`: report output owner for interim runs.
- `artifacts/reports/implementation/`: implementation evidence and handoff reports.
- External repos/projects: Hoplon, Phalanx, Semantix, Guardrail, Program Manager MCP.

## Core Concepts

### Program

A durable initiative that spans projects and verticals.

Examples:
- `agentic-os`
- `hoplon-authz`
- `semantix-readiness`
- `guardrail-runtime-controls`
- `provider-broker`

### Project

A participating codebase/system.

Examples:
- `cp-program-manager-mcp`
- `hoplon`
- `phalanx`
- `semantix`
- `guardrail`

### Vertical

A workstream inside a program, such as authz, runtime, operations dashboard, provider broker, readiness control, policy enforcement, audit, or reporting.

### IntegrationPoint

A cross-project dependency that needs coordination.

Example:

```json
{
  "integrationPointId": "hoplon-authz-escalation-grant",
  "programId": "agentic-os",
  "producerProjectId": "hoplon",
  "consumerProjectIds": ["cp-program-manager-mcp", "phalanx"],
  "contractRefs": ["repo://ProgramManagerMCP/shared/schemas/hoplon-authz.ts"],
  "status": "active",
  "owner": "cp-program-manager"
}
```

### Contract

A schema, API, event, MCP tool, authz policy, evidence contract, trace contract, or operational behavior that one project exposes and another depends on.

### Capability Adapter

A plug-in that exposes one standalone capability to Program Manager through a stable adapter contract.

Examples:
- `llm-tracker-adapter`
- `hoplon-adapter`
- `serena-adapter`
- `github-adapter`
- `guardrail-adapter`
- `semantix-adapter`
- `phalanx-adapter`

### AlignmentRun

One reconciliation pass over a program. It reads status, checks contracts, detects drift, proposes propagation, emits audit, and writes a report.

### PropagationPlan

A PMO flight plan describing which downstream actions should happen because of a change, which agents/tools should perform them, and which receipts/evidence must come back.

### ActionReceipt

A receipt submitted by an LLM or worker agent after it performs an external action. Program Manager validates the receipt against the flight plan, records it in the ledger, and updates projections.

### ReconciliationFinding

A PMO-detected mismatch between expected state and observed state, such as missing receipts, stale evidence, conflicting tracker state, branch-inapplicable decisions, or incomplete propagation.

## Program Memory Model

Program Manager should maintain durable cross-project memory in its own store. The MCP tools are an access layer over this memory; they are not the memory itself.

Baseline entities:

- `Portfolio`: top-level PMO scope containing multiple programs and cross-program dependencies.
- `Program`: durable initiative with owners, goals, active verticals, participating projects, status, and reporting cadence.
- `Project`: participating repo/system with tracker slug, repo refs, adapter bindings, and environment metadata.
- `BranchContext`: repo branch/ref/worktree context with commit, tracker revision, Hoplon snapshot/session refs, and adapter sync cursors.
- `ContextAnchor`: request-time anchor for reconstructing applicable facts for a project/program at a branch, commit, tracker revision, and optional as-of time.
- `Vertical`: workstream inside a program.
- `ProgramMembership`: temporal membership record linking a project to a program and vertical.
- `IntegrationPoint`: cross-project dependency with producer, consumers, contract refs, owner, status, and verification requirements.
- `Contract`: schema/API/event/tool/policy/evidence contract with version, compatibility status, producer, consumers, and evidence refs.
- `DependencyEdge`: typed dependency between tasks, projects, contracts, tools, or decisions.
- `CrossProgramDependency`: dependency edge where one program's outcome, decision, contract, or project state affects another program.
- `DecisionRequest`: open decision/gate with authority required, affected scope, due date, status, and evidence refs.
- `DecisionRecord`: resolved decision with approver, rationale summary, constraints, expiration/review date, and supersession refs.
- `DiscardedDecision`: rejected, superseded, or abandoned decision option with reason, evidence refs, and conditions under which it should remain avoided.
- `AttemptRecord`: attempted implementation, propagation, verification, migration, decision, or integration action with outcome and evidence refs.
- `LearningRecord`: reusable lesson derived from attempts, decisions, blockers, audits, incidents, or repeated program patterns.
- `FailurePattern`: normalized recurring failure mode detected across projects or programs.
- `RiskSignal`: proactive warning derived from stale evidence, repeated failures, branch divergence, discarded decisions, contract drift, dependency fan-out, or policy health.
- `Finding`: stale evidence, contract drift, missing proof, blocked task, policy denial, or health degradation.
- `TemporalFact`: immutable fact with valid time, recorded time, source cursor, evidence refs, and supersession metadata.
- `EvidenceRef`: pointer-only reference to proof, audit, report, trace, diff, test result, policy result, or tracker history.
- `ArtifactRef`: typed metadata for generated or imported artifacts such as reports, manifests, schemas, snapshots, traces, and handoffs.
- `ActionLedgerEntry`: planned external action with trace, correlation, idempotency, expected receipts, observed receipts, and reconcile status.
- `ExpectedReceipt`: receipt obligation generated by a flight plan.
- `ObservedReceipt`: receipt submitted by an agent or imported from an adapter/event source.
- `PropagationEdge`: causation link from one finding/event/decision to downstream proposed actions, expected receipts, or observed receipts.
- `AdapterBinding`: configured adapter, capability manifest version, project scope, authz scope, and health status.
- `SyncCursor`: last observed revision/event/hash per external tool so Program Manager can reconcile without relying on chat history.

The store should be exposed through a repository interface so TypeScript service logic and tests do not depend on raw Cypher everywhere. Phase 1 should use Neo4j through a `ProgramManagerGraphRepository`, with an in-memory repository for narrow unit tests. LLM Tracker should be integrated through an adapter and sync cursor, not used as the only persistence layer.

## Portfolio And Temporal Memory

Program Manager should support multiple programs, multiple projects, and projects that move between branches or time-travel through git/tracker history.

Every persisted fact that can affect execution should be scoped by:

- `portfolioId`
- optional `programId`
- optional `projectId`
- optional `repoId`
- optional `branchName`
- optional `gitCommit`
- optional `trackerSlug`
- optional `trackerRev`
- optional `contractRef` or contract version/hash
- optional `integrationPointId`
- `validFrom` and optional `validTo`
- `recordedAt`
- optional `supersededBy`
- `sourceAdapterId`
- `sourceCursor`
- `evidenceRefs`

Use bitemporal semantics:

- **Valid time:** when a decision, dependency, contract, blocker, or risk applies.
- **Recorded time:** when Program Manager learned or recorded it.

When an agent asks for work context, Program Manager should require or infer a `ContextAnchor`.

```ts
export const ProgramContextAnchorSchema = z.object({
  portfolioId: z.string().optional(),
  programId: z.string().optional(),
  projectId: z.string().optional(),
  repoId: z.string().optional(),
  branchName: z.string().optional(),
  gitCommit: z.string().optional(),
  trackerSlug: z.string().optional(),
  trackerRev: z.number().int().optional(),
  hoplonSnapshotRef: z.string().optional(),
  asOf: z.string().optional(),
});
```

The same query against different anchors may produce different applicable decisions, blockers, dependencies, and risks. This prevents "latest main branch" decisions from leaking into old branches and prevents old branch state from silently overwriting current program truth.

Program Manager should be able to return:

- applicable decisions for this anchor
- superseded or discarded decisions to ignore
- future decisions not yet valid for this anchor
- unresolved dependencies
- branch-divergent blockers
- stale or missing evidence
- contract compatibility notes
- recommended tracker/report/program updates

### State Version Hash

Determinism is testable only if PMO can pin the exact state used for a plan or query. Every planning, impact, intelligence, and reconciliation result must carry a canonical `stateVersionHash`.

`stateVersionHash` should be Merkle-style over the relevant deterministic state:

- context anchor after canonical JSON serialization with sorted keys
- relevant PMO cp-graph nodes and relationships, sorted by stable id and relationship type
- relationship properties that affect planning, including temporal scope, status, criticality, evidence requirements, policy refs, and source cursor
- adapter manifest ids and versions used for the result
- adapter sync cursors and source revision hashes used for the result
- artifact/evidence refs and their content digests, not raw artifact contents
- deterministic rule versions used for impact, learning, gate, and receipt calculations

Neo4j repository methods that contribute to a deterministic result must use explicit `ORDER BY` clauses for every traversal boundary and collection return. Tests should seed a fixture cp-graph, compute `stateVersionHash`, run the same query twice, and assert identical hashes and outputs. Model-assisted advisory output is excluded from `stateVersionHash`.

## Cross-Program Learning Model

Program Manager should convert execution history into reusable, evidence-backed learnings. These are not free-form LLM memories; they are typed records derived from attempts, outcomes, decisions, blockers, audits, reports, and adapter evidence.

Learning capture sources:

- LLM Tracker history, blocker cp-graphs, decision-gated tasks, comments, handoffs, and verification packs.
- Hoplon audit blocks, repair contexts, policy denials, session review payloads, and behavior verification results.
- Semantix readiness/spec failures and stale readiness status.
- Guardrail runtime/policy findings.
- GitHub PR, CI, issue, and review state.
- Program Manager action ledger entries, propagation suppressions, partial failures, reconcile requests, and reports.

Normalized learning types:

- `failed_attempt`: an attempted approach failed or was reverted.
- `discarded_decision`: a decision option was rejected, superseded, or abandoned.
- `repeated_blocker`: same blocker pattern appears across projects/programs.
- `contract_drift`: producer and consumer contract expectations diverged.
- `stale_evidence`: proof is too old for current branch/contract/context.
- `policy_conflict`: authz or policy constraints block an otherwise valid plan.
- `fragile_integration`: integration point repeatedly causes failures or manual intervention.
- `branch_divergence`: branch-specific state differs materially from current program memory.
- `tool_health_degradation`: adapter/tool reliability affects execution confidence.
- `successful_mitigation`: previous mitigation resolved a class of issue and may be reusable.

Every `LearningRecord` should include:

- `learningId`
- `schemaVersion`
- `learningType`
- `portfolioId`
- optional `programIds`
- optional `projectIds`
- optional `integrationPointIds`
- optional `contractRefs`
- optional `branchContexts`
- `summary`
- `whyItMatters`
- `conditions`: when this learning applies
- `recommendedAction`
- `avoidAction`: what not to repeat, when known
- `confidence`
- `status`: `active`, `needs_review`, `superseded`, `retired`
- `derivedFrom`: evidence refs, action ledger refs, decision refs, task refs, or artifact refs
- `validFrom`
- optional `validTo`
- optional `supersededBy`

`LearningRecord.confidence` must be explainable. V1 should use an explicit calculation instead of a free-form score:

- `operator_asserted`: a human/operator sets the confidence and the record carries `confidenceReason`.
- `evidence_ratio`: `min(1, 0.35 + 0.15 * corroboratingEvidenceCount + 0.10 * successfulOutcomeCount - 0.15 * contradictoryOutcomeCount)`, capped at `0.95` unless operator-approved.
- `adapter_reported`: adapter supplies a confidence plus a typed method, and PMO records that method.

If the confidence cannot be calculated through one of these modes, set `status: "needs_review"` and `confidence <= 0.5`.

Discarded decisions deserve first-class storage. "We tried X and rejected it because Y" is often more valuable than the chosen decision. PMO should surface discarded decisions when a future plan resembles the rejected option under matching conditions.

V1 resemblance matching should be typed and deterministic:

- Every `DiscardedDecision` and proposed change carries `conditionTags`, such as `contract:hoplon-authz`, `action:add_blocker`, `scope:privileged_policy`, `risk:policy_scope_leakage`, or `project:cp-program-manager-mcp`.
- A match requires at least one shared `contract:*` or `integration:*` tag, one shared `action:*` or `risk:*` tag, and no conflicting `branch:*`, `program:*`, or `validTime` condition.
- Optional embeddings or LLM summaries may add advisory matches, but those must be labeled `model_assisted` and must not suppress or block a plan unless converted into a deterministic tagged match.

## Proactive Intelligence Loop

Program Manager should proactively identify cross-project and cross-program issues by running scheduled or event-triggered analysis over temporal facts, dependencies, learnings, and adapter state.

Signal rules should be deterministic first, model-assisted second:

1. Gather changed facts since the last `SyncCursor`.
2. Rebuild affected projections for impacted portfolios, programs, projects, contracts, and branches.
3. Match known `FailurePattern`, `DiscardedDecision`, and `LearningRecord` conditions.
4. Detect cp-graph risk: high dependency fan-out, blocked critical path, stale evidence on active dependency, missing consumer verification, or branch divergence.
5. Ask adapters for targeted `assessImpact` only where the fact cp-graph indicates possible impact.
6. Emit `RiskSignal` and `Finding` records with evidence refs and recommended actions.
7. Propose tracker comments/blockers/decision requests, reports, or verification reruns through flight-plan propagation.

Deterministic and model-assisted output must be partitioned:

- `deterministicCore`: cp-graph traversal, typed condition-tag matching, schema validation, adapter sync cursors, policy gates, receipt due policy, and artifact/evidence hashes. This is the stable PMO contract and is included in state/version hashes and flight-plan hashes.
- `advisoryPane`: LLM summaries, embedding similarity, narrative prioritization, and optional recommendations. This may be useful to operators but is not part of the deterministic flight-plan hash and must be labeled `model_assisted`.
- A model-assisted finding can become deterministic only after PMO persists typed evidence, tags, or an operator-approved decision that the deterministic rules can replay.

Examples:

- A Hoplon authz contract changes on `main`; Program Manager finds three consumer projects whose tracker tasks depend on the old contract hash and proposes stale-evidence blockers.
- A proposed implementation matches a `DiscardedDecision` that was rejected two weeks earlier due to policy scope leakage; Program Manager warns the agent and links the decision evidence.
- Two programs independently fail on the same Semantix readiness condition; Program Manager records a cross-program `FailurePattern` and proposes a shared mitigation task.
- A branch checkout moves Hoplon back before a decision's `validFrom`; Program Manager marks that decision future-not-applicable for the current anchor and relays the older applicable constraints.

Proactive findings must be bounded and explainable. The LLM should receive concise issue cards with:

- issue type
- affected programs/projects/contracts
- why this is relevant now
- evidence refs
- confidence and deterministic rule/source
- recommended next action
- whether a tracker/report/decision update is proposed or already has a receipt

## Memory Relay Contract

Program Manager should relay applicable memory back to agents through bounded context packets, not through raw database reads.

Every execution or planning packet should include these panes when relevant:

- `currentState`: applicable program/project/contract/dependency state for the supplied `ContextAnchor`.
- `blockingDependencies`: unresolved dependencies and decision gates with tracker/task refs.
- `applicableDecisions`: active decisions whose valid scope matches the anchor.
- `discardedDecisions`: rejected approaches that match the current plan or context, with reasons and evidence refs.
- `supersededDecisions`: old decisions that should not be followed, with replacement refs.
- `futureDecisions`: decisions recorded in Program Manager but not yet valid for this branch/commit/tracker revision.
- `pastFailedAttempts`: prior attempts that resemble the current plan and their failure modes.
- `reusableMitigations`: successful mitigations that apply under the current conditions.
- `crossProgramSignals`: risks, blockers, or learnings discovered in other programs that affect this scope.
- `staleEvidence`: evidence that existed but no longer proves the current branch/contract/context.
- `recommendedActions`: proposed tracker, verification, report, or decision updates.

The packet should be small enough for an LLM to act on directly. Each item should include an evidence ref and a one-line explanation of why it was included. Raw logs, transcripts, diffs, screenshots, and long reports stay behind artifact/evidence refs.

## Passive Analyst Boundary

Program Manager should never be the component that calls mutation-capable downstream tools such as Hoplon edit sessions, LLM Tracker writes, GitHub writes, Guardrail changes, or Semantix updates.

The Agentic OS loop should be:

1. An LLM or worker agent proposes a change.
2. The agent asks Program Manager to assess impact and produce a flight plan.
3. Program Manager computes blast radius from its DB, cp-graph projections, dependency edges, artifact refs, decisions, learnings, and read-only adapter state.
4. Program Manager returns affected projects, dependencies, risks, approval gates, evidence requirements, and expected receipts.
5. The agent performs the work using its own authorized tools and specialized worker agents.
6. The agent submits receipts back to Program Manager.
7. Program Manager records receipts, updates projections, reconciles observed state, and flags desynchronization if required receipts or downstream facts are missing.

This keeps PMO deterministic and observable. It defines what is allowed, who is affected, and what evidence must exist, while execution remains in the agentic layer.

## Flight Plan Contract

Program Manager's primary planning artifact is a flight plan, not an execution request.

```ts
export const ProgramReceiptDuePolicySchema = z.object({
  policyId: z.string(),
  startsAt: z.string(),
  dueAt: z.string(),
  warnAfterSeconds: z.number().int().min(0),
  staleAfterSeconds: z.number().int().min(0),
  lostAfterSeconds: z.number().int().min(0),
  escalationRefs: z.array(z.string()).default([]),
});

export const ProgramFlightPlanSchema = z.object({
  schemaVersion: z.literal("1"),
  flightPlanId: z.string(),
  flightPlanHash: z.string(),
  stateVersionHash: z.string(),
  portfolioId: z.string().optional(),
  programId: z.string(),
  contextAnchor: ProgramContextAnchorSchema.optional(),
  generatedAt: z.string(),
  expiresAt: z.string(),
  ttlSeconds: z.number().int().min(1),
  proposedChange: z.object({
    changeType: z.string(),
    targetRefs: z.array(z.string()),
    summary: z.string(),
  }),
  blastRadius: z.object({
    affectedProgramIds: z.array(z.string()).default([]),
    affectedProjectIds: z.array(z.string()).default([]),
    affectedIntegrationPointIds: z.array(z.string()).default([]),
    affectedContractRefs: z.array(z.string()).default([]),
  }),
  gaps: z.array(
    z.object({
      gapId: z.string(),
      kind: z.string(),
      summary: z.string(),
      evidenceRefs: z.array(z.string()).default([]),
    }),
  ),
  dependencies: z.array(
    z.object({
      dependencyId: z.string(),
      dependencyType: z.string(),
      fromRef: z.string(),
      toRef: z.string(),
      status: z.enum(["open", "blocked", "satisfied", "unknown"]),
      reason: z.string(),
    }),
  ),
  risks: z.array(
    z.object({
      riskId: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      summary: z.string(),
      requiresApproval: z.boolean().default(false),
      evidenceRefs: z.array(z.string()).default([]),
    }),
  ),
  proposedExternalActions: z.array(
    z.object({
      proposedActionId: z.string(),
      targetAdapterId: z.string(),
      action: z.string(),
      targetRef: z.string(),
      executionOwner: z.enum(["llm_agent", "worker_agent", "human_operator"]),
      idempotencyKey: z.string(),
      reason: z.string(),
      requiredApprovalRefs: z.array(z.string()).default([]),
      expectedReceiptIds: z.array(z.string()).default([]),
    }),
  ),
  expectedReceipts: z.array(
    z.object({
      expectedReceiptId: z.string(),
      proposedActionId: z.string(),
      receiptType: z.string(),
      requiredFields: z.array(z.string()).default([]),
      evidenceRequirements: z.array(z.string()).default([]),
      duePolicy: ProgramReceiptDuePolicySchema,
    }),
  ),
  evidenceObligations: z.array(z.string()).default([]),
  deterministicCore: z.object({
    ruleVersions: z.array(z.string()).default([]),
    repositoryQueryIds: z.array(z.string()).default([]),
    adapterCursorRefs: z.array(z.string()).default([]),
  }),
  advisoryPane: z
    .object({
      modelAssistedFindings: z.array(z.unknown()).default([]),
      excludedFromFlightPlanHash: z.literal(true),
    })
    .optional(),
  traceId: z.string(),
  correlationId: z.string(),
});
```

Flight plans must be deterministic for the same stored state, context anchor, proposed change, adapter manifest versions, and deterministic rule versions. `flightPlanHash` is computed over the canonical deterministic core only; `advisoryPane` is excluded.

Concurrency and staleness rules:

- A flight plan is pinned to `stateVersionHash`.
- Default TTL is 30 minutes unless a stricter domain policy applies.
- Execution agents should submit the `flightPlanId`, `flightPlanHash`, and `flightPlanStateVersionHash` with every receipt.
- If the current PMO state hash differs when a receipt arrives, PMO records the submitted receipt as an observation but does not mark the expected receipt satisfied until `reconcile_program_state` revalidates it against the newer state.
- Expired flight plans cannot satisfy expected receipts without revalidation. PMO should return `stale_plan_revalidation_required` and propose a replacement flight plan when applicable.
- PMO is roll-forward only. Failed or partial flight plans are not transactions; compensating work is represented as a new flight plan with its own expected receipts.

## Artifact Model

Program Manager needs an artifact registry because it coordinates a wide array of program evidence without inlining sensitive or bulky data.

Every artifact record should include:

- `artifactId`
- `artifactType`: `alignment_report`, `implementation_report`, `tracker_snapshot`, `hoplon_audit`, `policy_result`, `test_result`, `contract_schema`, `decision_packet`, `handoff`, `trace_export`, `screenshot_ref`, `provider_transcript_ref`, or future typed values
- `storageUri`
- `contentHash`
- `producedByAdapterId`
- `programId`
- optional `projectId`, `integrationPointId`, `contractRef`, `proposedActionId`, `decisionId`
- `classification`: `public`, `internal`, `operator_only`, `content_bearing_evidence`, `secret_adjacent`
- `redactionStatus`
- `createdAt`
- `expiresAt` or retention policy ref

The artifact registry stores metadata and pointers. Raw content stays in the owning system, evidence store, repo artifact path, or policy-controlled report location.

## Decision Memory

Program Manager should own typed decision memory. LLM Tracker can surface decision gates to agents, but it should not be the only decision record.

Decision flow:

1. Program Manager detects a decision gate from dependency, contract, policy, evidence, or tracker state.
2. Program Manager creates a `DecisionRequest` with affected projects/contracts/tasks and evidence refs.
3. Program Manager includes a proposed LLM Tracker update in the flight plan so execution agents can make the blocker visible.
4. A human/operator/C-suite agent records the decision through Program Manager with authority and evidence context.
5. Program Manager writes a `DecisionRecord`, updates affected dependency edges, and proposes tracker unblock/update actions.

Decision records should support supersession. A later decision should not overwrite the old one; it should mark the prior decision superseded and preserve the trace.

## Design Artifacts

This work needs more than one document type:

- **ADR:** record the core architectural decision that Program Manager is a stateful memory service with its own DB, not just an MCP facade and not an LLM Tracker overlay.
- **Architecture spec:** describe service boundaries, adapter contracts, repository interfaces, data flow, sync/reconcile loops, event model, and MCP tool surface.
- **Data model spec:** define database entities, indexes, retention rules, artifact classifications, and cp-graph-mirroring strategy.
- **Adapter contract spec:** define manifests, action schemas, impact assessment, evidence production, idempotency, propagation ancestry, health, and reconciliation.
- **Operational runbook:** describe how to recover from partial failures, stale sync cursors, missing evidence, adapter outages, and desynchronized tracker/report state.

The ADR should be short and decisive. The architecture and data model specs should carry the wide artifact and database details.

## Data Model Spec Priority

The next critical artifact should be the **Program Manager Data Model Spec**, with special focus on `DependencyEdge` and `ArtifactRef`. The service boundary is now clear: PMO analyzes, plans, records receipts, and reconciles. The data model determines whether that analysis is useful.

Implementation direction:

- Language: TypeScript.
- Primary DB: Neo4j.
- Driver: `neo4j-driver` wrapped behind a `ProgramManagerGraphRepository`.
- Testability: use an in-memory repository for pure unit tests and Neo4j-backed integration tests for traversal/gate semantics.
- Boundary: service methods should call repository methods such as `calculateBlastRadius`, `findUnsatisfiedApprovalGates`, `recordReceipt`, and `reconcileFlightPlan`; raw Cypher should stay in the repository/DAO layer.

Neo4j is a strong fit because PMO's core job is cp-graph traversal: changed contract -> affected integration points -> consumer projects -> tracker tasks -> policies -> approval gates -> evidence requirements. The data model spec should still come first because labels, relationship names, uniqueness constraints, and temporal fields determine whether the cp-graph answers the right questions.

Example blast-radius query:

```cypher
MATCH (target:Contract {id: $contractId})
MATCH path = (target)-[r*1..3]->(affected)
WHERE all(rel IN r WHERE coalesce(rel.status, "active") IN ["active", "pending", "blocked"])
RETURN affected.id AS id,
       labels(affected) AS labels,
       [rel IN r | type(rel)] AS relationshipTypes,
       length(path) AS distance
ORDER BY distance ASC
```

The production query should also filter by `portfolioId`, `programId`, `ContextAnchor`, branch/commit/tracker revision, valid-time window, and supersession status.

### DependencyEdge Requirements

`DependencyEdge` must represent project, program, branch, contract, task, tool, policy, evidence, and decision dependencies in one normalized model.

Required fields:

- `dependencyId`
- `dependencyType`: `program_depends_on_program`, `project_depends_on_contract`, `task_depends_on_task`, `contract_consumed_by_project`, `decision_blocks_action`, `policy_blocks_action`, `evidence_required_for_contract`, `tool_required_for_verification`, `branch_diverges_from_context`, or future typed values
- `fromRef`
- `toRef`
- `portfolioId`
- optional `programId`
- optional `projectId`
- optional `integrationPointId`
- optional `contractRef`
- optional `branchContextId`
- optional `trackerSlug`
- optional `trackerTaskId`
- `criticality`: `tier_0`, `tier_1`, `tier_2`, `tier_3`
- `status`: `active`, `pending`, `satisfied`, `blocked`, `stale`, `superseded`, `discarded`
- `validFrom`
- optional `validTo`
- `recordedAt`
- optional `supersededBy`
- `sourceAdapterId`
- `sourceCursor`
- `evidenceRefs`
- `policyRefs`
- `approvalRequired`
- `verificationRequired`
- `receiptRequirements`

The edge model must support:

- blast-radius traversal from a changed contract, task, decision, project, or artifact
- reverse lookup from an affected project back to the causal contract/decision/task
- branch/time-travel filtering through `ContextAnchor`
- cross-program dependencies
- stale evidence detection
- decision-gated work
- discarded/superseded decision filtering
- critical-path and high-fan-out risk detection

Neo4j mapping:

- Use first-class relationship types for hot traversals, such as `CONSUMES_CONTRACT`, `PRODUCES_CONTRACT`, `REQUIRES_APPROVAL`, `REQUIRES_EVIDENCE`, `BLOCKS`, `DEPENDS_ON`, `SUPERSEDES`, `HAS_RECEIPT`, and `AFFECTS`.
- Keep a stable `dependencyId` on each relationship so it can be referenced in audit records and receipts.
- Store temporal and scope fields on relationships: `portfolioId`, `programId`, `branchContextId`, `validFrom`, `validTo`, `recordedAt`, `status`, `criticality`, `sourceAdapterId`, and `sourceCursor`.
- Use labels for node identity and query targeting: `Contract`, `Project`, `Program`, `TrackerTask`, `Policy`, `ApprovalGate`, `Evidence`, `Artifact`, `Decision`, `RiskSignal`, `Finding`.
- Add uniqueness constraints for stable ids on every label used as a target.

### HITL And Audit Gate Requirements

The hardest cp-graph rules to map first are human-in-the-loop constraints and audit requirements. These are policy dependencies, not code dependencies, and they determine whether a flight plan is only advisory or hard-blocked.

Represent HITL as cp-graph state:

```cypher
(action:ProposedAction)-[:REQUIRES_APPROVAL {
  dependencyId: "dep-approval-hoplon-authz-tier1",
  status: "blocked",
  criticality: "tier_1",
  policyRef: "policy://active_adapters/hoplon-authz-tier1"
}]->(gate:ApprovalGate)

(gate)-[:SATISFIED_BY]->(decision:DecisionRecord)
(decision)-[:EVIDENCED_BY]->(artifact:Artifact)
```

Rules:

- Tier 0/1 contracts, production deployment schemas, privileged policy changes, and high-fan-out dependencies should create `ApprovalGate` nodes.
- A proposed action with an unsatisfied `REQUIRES_APPROVAL` edge is a **hard block** in the PMO flight plan.
- Program Manager should not perform the final commit or downstream mutation. It returns `allowed: false`, names the unsatisfied gate, and lists required receipts/evidence.
- Execution tools such as worker agents, GitHub checks, or Hoplon policy gates may consume the PMO gate result and refuse execution until the cp-graph has a satisfied approval path.
- Approval satisfaction must be evidence-backed: a gate is satisfied only when it links to an active `DecisionRecord` with valid scope/time and required `ArtifactRef` evidence.
- Superseded, expired, branch-inapplicable, or future-not-applicable decisions must not satisfy the gate.

Example approval-gate query:

```cypher
MATCH (action:ProposedAction {id: $proposedActionId})
MATCH (action)-[req:REQUIRES_APPROVAL]->(gate:ApprovalGate)
WHERE req.status <> "satisfied"
OPTIONAL MATCH (gate)-[:SATISFIED_BY]->(decision:DecisionRecord)-[:EVIDENCED_BY]->(artifact:Artifact)
RETURN gate.id AS gateId,
       req.criticality AS criticality,
       req.policyRef AS policyRef,
       collect(decision.id) AS candidateDecisionIds,
       collect(artifact.id) AS evidenceArtifactIds
```

The service should post-process candidate decisions against `ContextAnchor`, valid-time, expiration, supersession, and evidence classification before declaring a gate satisfied.

### ArtifactRef Requirements

`ArtifactRef` must be the pointer-only index for evidence and generated PMO artifacts.

Required fields:

- `artifactId`
- `artifactType`
- `storageUri`
- `contentHash`
- `producer`: adapter id, agent id, tool id, or human operator
- `portfolioId`
- optional `programId`
- optional `projectId`
- optional `repoId`
- optional `branchName`
- optional `gitCommit`
- optional `trackerRev`
- optional `integrationPointId`
- optional `contractRef`
- optional `decisionId`
- optional `flightPlanId`
- optional `receiptId`
- `classification`
- `redactionStatus`
- `validFrom`
- optional `validTo`
- `createdAt`
- optional `expiresAt`
- `retentionPolicyRef`
- `sourceCursor`

The artifact registry must support:

- evidence lookup for a flight plan, receipt, decision, dependency, or finding
- freshness checks for branch/commit/tracker-revision context
- redaction-safe PMO reports
- reproducible overview generation
- receipt validation against required evidence types
- linking failed attempts and discarded decisions back to concrete proof

## Capability Adapter Contract

Each adapter must provide a read/analysis/sync manifest and standard methods. The LLM should not need to know all downstream tool details, and Program Manager should not receive mutation authority for those tools.

### Adapter Manifest Shape

```ts
export const ProgramCapabilityAdapterManifestSchema = z.object({
  schemaVersion: z.literal("1"),
  adapterId: z.string(),
  version: z.string(),
  displayName: z.string(),
  domains: z.array(z.string()),
  capabilities: z.array(
    z.object({
      capabilityId: z.string(),
      description: z.string(),
      sideEffect: z.enum(["read", "analysis", "proposal", "receipt_ingest", "internal_projection"]),
      requiresApproval: z.boolean(),
      schemaRef: z.string(),
      emits: z.array(z.string()).default([]),
      consumes: z.array(z.string()).default([]),
      resources: z.array(z.string()).default([]),
      sourceCursors: z.array(z.string()).default([]),
      evidenceTypes: z.array(z.string()).default([]),
    }),
  ),
  authz: z.object({
    readableBy: z.array(z.string()),
    writableBy: z.array(z.string()), // Program Manager DB/internal projections only.
  }),
});
```

### Impact Assessment Schemas

`assessImpact` is load-bearing for the adapter contract. Phase 0 must not close until PMO has a shared request/result schema and fixture examples for at least LLM Tracker and Hoplon.

```ts
export const ProgramImpactAssessmentRequestSchema = z.object({
  schemaVersion: z.literal("1"),
  impactAssessmentId: z.string(),
  portfolioId: z.string().optional(),
  programId: z.string(),
  contextAnchor: ProgramContextAnchorSchema.optional(),
  stateVersionHash: z.string(),
  actorId: z.string(),
  actorRole: z.string(),
  traceId: z.string(),
  correlationId: z.string(),
  causationId: z.string().optional(),
  sourceAdapterId: z.string().optional(),
  targetAdapterId: z.string(),
  capabilityId: z.string(),
  proposedChange: z.object({
    changeType: z.string(),
    targetRefs: z.array(z.string()),
    summary: z.string(),
    payloadSchemaRef: z.string().optional(),
    payloadDigest: z.string().optional(),
  }),
  scope: z.object({
    projectIds: z.array(z.string()).default([]),
    integrationPointIds: z.array(z.string()).default([]),
    contractRefs: z.array(z.string()).default([]),
    trackerSlugs: z.array(z.string()).default([]),
  }),
  sourceCursors: z.array(z.string()).default([]),
  evidenceRefs: z.array(z.string()).default([]),
  propagationDepth: z.number().int().min(0).default(0),
  maxPropagationDepth: z.number().int().min(1).default(8),
  propagationPath: z.array(z.unknown()).default([]),
});

export const ProgramImpactAssessmentResultSchema = z.object({
  schemaVersion: z.literal("1"),
  impactAssessmentId: z.string(),
  targetAdapterId: z.string(),
  capabilityId: z.string(),
  stateVersionHash: z.string(),
  assessedAt: z.string(),
  deterministicCore: z.object({
    affectedProgramIds: z.array(z.string()).default([]),
    affectedProjectIds: z.array(z.string()).default([]),
    affectedIntegrationPointIds: z.array(z.string()).default([]),
    affectedContractRefs: z.array(z.string()).default([]),
    dependencyIds: z.array(z.string()).default([]),
    requiredApprovalRefs: z.array(z.string()).default([]),
    evidenceRequirements: z.array(z.string()).default([]),
    ruleVersions: z.array(z.string()).default([]),
  }),
  proposedExternalActions: z.array(
    z.object({
      proposedActionId: z.string(),
      targetAdapterId: z.string(),
      action: z.string(),
      targetRef: z.string(),
      reason: z.string(),
      idempotencyKey: z.string(),
      expectedReceiptTypes: z.array(z.string()).default([]),
    }),
  ),
  risks: z.array(
    z.object({
      riskId: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      summary: z.string(),
      evidenceRefs: z.array(z.string()).default([]),
    }),
  ),
  gaps: z.array(
    z.object({
      gapId: z.string(),
      kind: z.string(),
      summary: z.string(),
      evidenceRefs: z.array(z.string()).default([]),
    }),
  ),
  advisoryPane: z
    .object({
      modelAssistedFindings: z.array(z.unknown()).default([]),
      excludedFromFlightPlanHash: z.literal(true),
    })
    .optional(),
  evidenceRefs: z.array(z.string()).default([]),
  traceId: z.string(),
  correlationId: z.string(),
});
```

### Adapter Methods

Every adapter should implement:

- `describeCapabilities()`
- `getObservationSchema(domain, observationType)`
- `readState(readRequest)`
- `assessImpact(ProgramImpactAssessmentRequest)`
- `reconcileState(scope)`
- `produceEvidenceRefs(observationResult)`
- `getSourceCursor(scope)`

The most important methods are `assessImpact` and `reconcileState`. They prevent the LLM from tracking propagation rules manually while keeping execution outside PMO.

Adapters may describe external actions and evidence requirements, but they must not execute those actions through Program Manager. Execution agents call the downstream tool directly and submit receipts back.

Every adapter must pass a shared conformance suite before being enabled for a production portfolio. The suite should validate manifest shape, schema refs, deterministic `assessImpact` output for fixture inputs, sync cursor monotonicity, health status behavior, evidence ref production, reconciliation behavior, and refusal to expose mutation authority through PMO.

### Analysis Request Envelope

All adapter read/analysis requests should be wrapped in a cp-program-manager-owned envelope. The payload stays adapter-specific, but trace, causation, loop prevention, and source-cursor metadata stay uniform.

```ts
export const ProgramAnalysisRequestEnvelopeSchema = z.object({
  analysisId: z.string(),
  programId: z.string(),
  projectId: z.string().optional(),
  adapterId: z.string(),
  capabilityId: z.string(),
  actorId: z.string(),
  actorRole: z.string(),
  traceId: z.string(),
  correlationId: z.string(),
  causationId: z.string().optional(),
  originEventId: z.string().optional(),
  originAdapterId: z.string().optional(),
  propagationDepth: z.number().int().min(0).default(0),
  maxPropagationDepth: z.number().int().min(1).default(8),
  propagationPath: z
    .array(
      z.object({
        adapterId: z.string(),
        eventId: z.string().optional(),
        analysisId: z.string().optional(),
        targetRef: z.string().optional(),
      }),
    )
    .default([]),
  sourceCursor: z.string().optional(),
  evidenceRefs: z.array(z.string()).default([]),
  payload: z.unknown(),
});
```

Loop-prevention rules:

- Program Manager owns `analysisId`, `traceId`, `correlationId`, `causationId`, `propagationDepth`, and `propagationPath`; adapters must not fabricate or overwrite them.
- `assessImpact` must suppress propagation when the next `(adapterId, targetRef, action)` already appears in `propagationPath`, or when `propagationDepth >= maxPropagationDepth`.
- Events emitted because of Program Manager analysis must carry the original `traceId` and `correlationId`, set `causationId` to the triggering `analysisId` or `eventId`, and append themselves to `propagationPath`.
- Suppressed loops should emit `PropagationSuppressed` with evidence refs explaining which path edge was rejected.

## Public MCP Tool Surface

Keep the MCP tool list small.

### `list_program_capabilities`

Purpose: list available domains/capabilities for a program without exposing all downstream tools.

Tool description:

> Use this when you need to discover which PMO capability or adapter domain can help with a program task. Do not use it to execute downstream work.

Inputs:
- `programId`
- optional `query`
- optional `projectId`

Returns:
- matching domains
- adapter IDs
- capability IDs
- side-effect classification
- documentation topics

### `get_program_documentation`

Purpose: retrieve tight documentation and schemas for a domain/action.

Inputs:
- `topic`
- optional `domain`
- optional `action`
- optional `programId`

Returns:
- available actions
- required payload schema
- examples
- authz rules
- evidence requirements
- common failure modes

Tool description:

> Use this before complex or mutating actions. Do not guess payload fields.

### `query_program_context`

Purpose: read program-aware context from adapters.

Tool description:

> Use this when you need concise PMO memory for a program, project, branch, contract, or as-of audit context. Prefer this over reading raw cp-graph/database state.

Inputs:
- `programId`
- `query`
- optional `contextAnchor`
- optional `asOf`
- optional `projectIds`
- optional `integrationPointIds`
- optional `domains`
- `maxResults`

Returns:
- concise findings
- evidence refs
- provenance
- redaction summary
- applicable/superseded/future-not-applicable decisions when a context anchor is supplied

### `plan_program_action`

Purpose: produce a deterministic PMO flight plan for an agent-proposed change.

Tool description:

> Use this before doing cross-project or externally visible work. It returns approvals, affected scope, and receipt obligations; it does not perform the work.

Inputs:
- `programId`
- `domain`
- `action`
- `payload`
- actor and scope metadata

Returns:
- selected adapter
- validation result
- required approvals
- expected downstream effects
- propagation flight plan
- evidence obligations
- expected receipts

### `record_program_receipt`

Purpose: record evidence that an agent or worker performed an external action from a PMO flight plan.

Tool description:

> Use this after an execution agent has already performed an action with its own authorized tool and needs PMO to validate and ledger the evidence.

Inputs:
- `programId`
- `flightPlanId`
- `flightPlanHash`
- `flightPlanStateVersionHash`
- `proposedActionId`
- `receipt`
- actor/scope metadata

Returns:
- receipt validation result
- updated ledger refs
- emitted events
- evidence refs
- reconciliation status

Program Manager must not execute the action represented by the receipt. It only validates, records, and reconciles.

### `reconcile_program_state`

Purpose: compare PMO's expected receipts/dependencies against observed adapter state and raise desynchronization findings.

Tool description:

> Use this to check whether PMO expected receipts, adapter-observed state, and dependency facts still agree. Use it for stale or partial flight plans.

Inputs:
- optional `portfolioId`
- optional `programId`
- optional `projectIds`
- optional `contextAnchor`
- optional `flightPlanId`
- optional `since`
- optional `asOf`

Returns:
- missing receipts
- conflicting receipts
- stale evidence
- dependency state mismatches
- desynchronization findings
- proposed remediation actions for agents
- evidence refs

Reconciliation is read/analysis plus PMO ledger updates only.

### `assess_program_impact`

Purpose: ask "what does this change affect?"

Tool description:

> Use this for read-only blast-radius analysis when you need affected projects, contracts, gates, and proposed follow-up actions without generating a full flight plan.

Inputs:
- `programId`
- `changeEvent`
- optional `projectId`
- optional `contractRefs`

Returns:
- affected projects
- affected integration points
- affected contracts
- tracker updates to propose
- verification gates to rerun
- decision requests
- residual risks

### `analyze_program_intelligence`

Purpose: surface proactive PMO intelligence without exposing raw stores or every downstream tool.

Tool description:

> Use this to ask PMO for proactive risks, repeated blockers, discarded decisions, stale evidence, and cross-program learnings. Treat model-assisted cards as advisory unless marked deterministic.

Inputs:
- optional `portfolioId`
- optional `programIds`
- optional `projectIds`
- optional `contextAnchor`
- `analysisTypes`: subset of `cross_program_risks`, `failed_attempts`, `discarded_decisions`, `repeated_blockers`, `stale_evidence`, `contract_drift`, `branch_divergence`, `tool_health`
- optional `since`
- optional `asOf`
- optional `maxResults`

Returns:
- concise issue cards
- affected programs/projects/contracts
- matched learning/failure/decision refs
- deterministic rule or source that triggered the finding
- confidence
- recommended next actions
- proposed tracker/report/decision updates
- evidence refs
- redaction summary

### `generate_program_update`

Purpose: generate PMO-style progress updates.

Tool description:

> Use this to create a reproducible program update from PMO state for a declared audience. Generated reports are artifacts, not source-of-truth state.

Inputs:
- `programId`
- period or since timestamp
- audience: `operator`, `cto`, `ceo`, `delivery`, `audit`
- optional `includeBlocked`

Returns:
- markdown status update
- open decisions
- blocker summary
- completed work
- next actions
- evidence refs

### `get_program_audit_trail`

Purpose: retrieve filtered audit history.

Tool description:

> Use this when you need evidence-backed PMO audit history for a program, trace, flight plan, receipt, or as-of question. Do not use it for broad raw log export.

Inputs:
- `programId`
- optional `alignmentRunId`
- optional `traceId`
- optional `eventTypes`
- optional `asOf`
- limit

Returns:
- safe audit entries
- evidence refs
- redaction notices

## Macro-Tool And Discovery Pattern

The LLM should see a small stable surface and ask Program Manager what to use.

Preferred flow:

1. Agent receives task.
2. Agent calls `list_program_capabilities` or `get_program_documentation`.
3. Agent calls `plan_program_action`.
4. Program Manager validates payload and computes impact.
5. Program Manager returns a flight plan: blast radius, dependencies, approvals, evidence obligations, and expected receipts.
6. Agent or worker agents execute the work using their own authorized tools.
7. Agent calls `record_program_receipt` for each completed external action.
8. Program Manager reconciles receipts against expected state and emits audit/evidence/progress events.

Do not expose granular downstream tool descriptions unless dynamically requested.

## Event Model

Every meaningful action should emit a typed event.

Required envelope fields:

```ts
{
  schemaVersion: string;
  eventId: string;
  eventType: string;
  programId: string;
  portfolioId?: string;
  alignmentRunId?: string;
  projectId?: string;
  branchName?: string;
  gitCommit?: string;
  trackerRev?: number;
  integrationPointId?: string;
  adapterId?: string;
  actorId: string;
  actorRole: string;
  traceId: string;
  correlationId: string;
  occurredAt: string;
  evidenceRefs: string[];
  causationId?: string;
  originEventId?: string;
  originAdapterId?: string;
  idempotencyKey?: string;
  propagationDepth?: number;
  propagationPath?: Array<{
    adapterId: string;
    eventId?: string;
    analysisId?: string;
    proposedActionId?: string;
    receiptId?: string;
    targetRef?: string;
  }>;
}
```

Initial event types:

- `ProgramCapabilityDiscovered`
- `ProgramDocumentationRead`
- `ProgramContextQueried`
- `ProgramActionPlanned`
- `ProgramActionRejected`
- `ProgramFlightPlanGenerated`
- `ProgramReceiptRecorded`
- `ProgramReceiptRejected`
- `AdapterActionPlanned`
- `AdapterActionRejected`
- `AgentExternalActionObserved`
- `ContractEvaluated`
- `ContractChanged`
- `ImpactAssessed`
- `PropagationPlanned`
- `PropagationSuppressed`
- `TrackerUpdateProposed`
- `DecisionRequested`
- `DecisionRecorded`
- `DecisionSuperseded`
- `DiscardedDecisionMatched`
- `FindingRecorded`
- `LearningRecorded`
- `FailurePatternDetected`
- `RiskSignalRaised`
- `CrossProgramRiskDetected`
- `ProactiveIssueRaised`
- `AttemptRecorded`
- `AlignmentReportWritten`
- `AlignmentRunStarted`
- `AlignmentRunCompleted`
- `ProgramStateDesynchronized`
- `ReconcileStateRequired`

## Authz Model

Initial roles:

- `human_operator`: may run reports, approve decisions, and review PMO findings.
- `program_manager_agent`: may read program context, plan actions, assess impact, generate proposed updates.
- `c_suite_agent`: may approve or reject program-level decisions within declared authority.
- `execution_agent`: may act from delegated work packets and submit receipts; no broad cp-graph or program discovery.
- `service_adapter`: service identity for adapters such as tracker, Hoplon, Semantix, Guardrail.

Rules:

- Execution agents cannot create or mutate program-level trackers directly.
- Client-supplied actor IDs must never be trusted for audit actor stamping.
- Server-verified identity must come from the configured trust root: OIDC/JWT issuer, mTLS service identity, or host-signed identity envelope.
- PMO flight plans must state authority, explicit scope, approval requirements, evidence obligations, and trace context.
- External side effects are performed outside PMO; PMO receipt ingestion validates evidence and records who claimed the action was done.

## Audit And Tracing

Required IDs:

- `traceId`: one operator/session/request trace.
- `correlationId`: one user request, agent turn, or workflow wake.
- `alignmentRunId`: one reconciliation pass.
- `programId`: durable program.
- `integrationPointId`: durable dependency.
- `flightPlanId`: one PMO plan.
- `proposedActionId`: one suggested external action.
- `receiptId`: one submitted action receipt.

Audit records must answer:

- Who requested this?
- Which role/authority was used?
- Which adapter was selected?
- Which downstream capability was expected or observed?
- What scope was authorized?
- What evidence was produced?
- What changed?
- Which projects/contracts were affected?
- Which updates were proposed, which receipts were received, and which expected receipts are missing?

Never store raw secrets, logs, transcripts, provider payloads, screenshots, or scratchpads inline.

## Impact And Propagation Requirements

Program Manager must detect whether a change affects other projects/tools.

Impact dimensions:

- Contract compatibility.
- Tracker status/blockers.
- Program progress.
- Cross-program dependency health.
- Branch/time-travel applicability.
- Prior failed attempts and discarded decisions.
- Repeated blocker and failure patterns.
- Proactive risk signals.
- Decision requirements.
- Verification requirements.
- Authz/policy scope.
- Audit/evidence completeness.
- Downstream implementation dependency.

Propagation targets:

- LLM Tracker task comments/status/blockers.
- Program alignment reports.
- Program Manager learning records, findings, and risk signals.
- Contract registry.
- Graph refs, when Agentic OS cp-graph writes are available.
- Hoplon policy checks.
- Semantix readiness/spec status.
- Guardrail runtime/policy evidence.
- Phalanx orchestration status.

The MVP should return propagation plans as PMO flight-plan proposals. Agents execute them outside PMO and submit receipts.

Example:

```json
{
  "proposedExternalActions": [
    {
      "proposedActionId": "pa-create-tracker-blocker",
      "adapterId": "llm-tracker",
      "action": "add_blocker",
      "target": "tracker://cp-program-manager-mcp/hopauth-013",
      "executionOwner": "llm_agent",
      "expectedReceiptIds": ["receipt-tracker-blocker-created"],
      "reason": "Contract hoplon-authz-escalation-grant changed and downstream proof is stale."
    },
    {
      "proposedActionId": "cp-program-manager",
      "adapterId": "cp-program-manager-agent",
      "action": "notify_breaking_contract_change",
      "target": "project://cp-program-manager-mcp",
      "executionOwner": "worker_agent",
      "expectedReceiptIds": ["cp-program-manager-notified"],
      "reason": "ProgramManagerMCP consumes the current contract and must plan schema compatibility work."
    },
    {
      "proposedActionId": "pa-record-report-note",
      "adapterId": "program-report",
      "action": "append_progress_note",
      "target": "artifact://artifacts/reports/alignment/...",
      "executionOwner": "llm_agent",
      "expectedReceiptIds": ["receipt-report-note-recorded"],
      "reason": "Program status changed from active to blocked."
    }
  ],
  "decisionRequests": [],
  "risks": []
}
```

## Receipt Ledger And Reconciliation Semantics

Program Manager should treat external execution as agent-owned. PMO records the expected receipts from a flight plan, ingests observed receipts from agents or adapter read state, and flags mismatches.

```ts
export const ProgramActionReceiptSchema = z.object({
  schemaVersion: z.literal("1"),
  receiptId: z.string(),
  flightPlanId: z.string(),
  flightPlanHash: z.string(),
  flightPlanStateVersionHash: z.string(),
  proposedActionId: z.string(),
  submittedByActorId: z.string(),
  submittedByRole: z.string(),
  status: z.enum([
    "submitted",
    "accepted",
    "rejected",
    "conflicts_with_observed_state",
    "stale_plan_revalidation_required",
  ]),
  targetAdapterId: z.string(),
  targetRef: z.string(),
  externalAction: z.string(),
  externalResultRef: z.string().optional(),
  externalResultDigest: z
    .object({
      algorithm: z.enum(["sha256"]),
      value: z.string(),
    })
    .optional(),
  verification: z.object({
    method: z.enum([
      "adapter_observed_state",
      "content_digest",
      "downstream_signed_receipt",
      "operator_attestation",
      "not_independently_verified",
    ]),
    verifiedAt: z.string().optional(),
    verifierAdapterId: z.string().optional(),
    signatureRef: z.string().optional(),
    limitations: z.array(z.string()).default([]),
  }),
  traceId: z.string(),
  correlationId: z.string(),
  evidenceRefs: z.array(z.string()).default([]),
  submittedAt: z.string(),
});

export const ProgramReconciliationResultSchema = z.object({
  schemaVersion: z.literal("1"),
  reconciliationId: z.string(),
  flightPlanId: z.string().optional(),
  status: z.enum([
    "in_sync",
    "missing_receipts",
    "conflicting_state",
    "stale_flight_plan",
    "stale_evidence",
    "desynchronized",
  ]),
  findings: z.array(
    z.object({
      findingId: z.string(),
      kind: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      summary: z.string(),
      expectedRef: z.string().optional(),
      observedRef: z.string().optional(),
      evidenceRefs: z.array(z.string()).default([]),
      recommendedAction: z.string().optional(),
    }),
  ),
  missingReceiptIds: z.array(z.string()).default([]),
  conflictingReceiptIds: z.array(z.string()).default([]),
  staleFlightPlanIds: z.array(z.string()).default([]),
  traceId: z.string(),
  correlationId: z.string(),
});
```

Threat model:

- V1 trusts execution agents to be authenticated and non-adversarial, but possibly buggy, incomplete, stale, or overconfident.
- PMO must not trust a receipt claim solely because an agent submitted it.
- Where the downstream tool can provide signed receipts or verifiable API state, PMO should require `downstream_signed_receipt` or `adapter_observed_state`.
- Where PMO cannot independently observe the result, it may record `operator_attestation` or `not_independently_verified`, but the receipt should remain lower confidence and should not satisfy high-risk evidence gates.
- `externalResultRef` must be pointer-only. If PMO or an adapter can fetch it, the receipt must include `externalResultDigest`, and reconciliation must verify the digest before accepting the receipt.

Receipt rules:

- Program Manager records expected receipts when it creates a flight plan.
- Program Manager never dispatches the external action.
- Agents or workers submit receipts after calling downstream tools themselves.
- Program Manager validates receipt shape, evidence refs, actor/scope, `flightPlanHash`, `flightPlanStateVersionHash`, due policy, content digest, downstream signature when available, and consistency with observed adapter state when available.
- If expected receipts are missing or observed state conflicts with submitted receipts, Program Manager emits `ProgramStateDesynchronized` and `ReconcileStateRequired`.
- For example, if the LLM creates an LLM Tracker blocker but forgets to notify ProgramManagerMCP, Program Manager preserves the accepted tracker receipt, marks `cp-program-manager-notified` missing, and raises a desynchronization finding in the next overview.

Receipt timing semantics:

- `duePolicy.warnAfterSeconds`: receipt is still in flight, but overview/reporting should show it as approaching risk.
- `duePolicy.staleAfterSeconds`: receipt is late; `reconcile_program_state` should emit a `missing_receipts` finding with severity at least `medium`.
- `duePolicy.lostAfterSeconds`: receipt is presumed lost unless an adapter observes completion; PMO should propose a replacement or compensating flight plan.
- A "stuck flight plan" is any non-expired flight plan with one or more expected receipts past `staleAfterSeconds`, or any expired flight plan with unsatisfied expected receipts.
- Reconciliation must distinguish `in_flight`, `late`, `lost`, `conflicting`, and `satisfied` expected receipt states so `missing_receipts` is actionable.

## Interim Persistence

Start with a database-backed Program Manager repository plus reviewable generated files. Do not make reports or trackers the canonical program memory store.

Files in `artifacts/reports/alignment/` are reproducible outputs of `generate_program_update` against PMO state. Deleting them must not lose information.

Recommended files:

- `shared/schemas/cp-program-manager.ts`
- `control-plane/packages/cp-program-manager/`
- `control-plane/tests/unit/cp-program-manager/`
- `artifacts/reports/alignment/`
- `control-plane/manifests/programs/*.json`
- optional `.llm-tracker/trackers/cp-program-manager.json`

Recommended persistence components:

- `ProgramManagerRepository`: typed repository interface used by service logic.
- `ProgramManagerGraphRepository`: Neo4j-backed implementation using `neo4j-driver`.
- `InMemoryProgramManagerRepository`: deterministic unit-test implementation for repository contract tests.
- `ProgramManagerArtifactStore`: pointer-only artifact metadata registry.
- `ProgramManagerSyncService`: adapter sync cursors for LLM Tracker, Hoplon, reports, and later cp-graph state.
- `ProgramManagerEventStore`: append-only program events and action ledger entries.

Neo4j cp-graph writes should be part of Phase 1 for PMO-owned memory. Generated files remain review artifacts; LLM Tracker remains an external operational board.

Recoverability policy:

- The append-only `ProgramManagerEventStore`, program registry manifests, adapter manifests, artifact metadata, evidence digests, and adapter sync cursors are the rebuild basis.
- Neo4j is the primary query/projection database, but the cp-graph must be re-derivable from the event store plus registry/manifests and adapter cursor refreshes.
- Phase 1 must include a tested rebuild path: start from an empty cp-graph, replay events in `occurredAt,eventId` order, refresh adapters from stored cursors, rebuild projections, and assert the fixture `stateVersionHash`.
- If any event type cannot be replayed deterministically, it must be marked with an explicit migration/reducer version and a fixture covering that migration.
- Until a replay path exists, the operational spec must declare Neo4j backup, RPO, and RTO. For audit-heavy PMO usage, RPO should target zero committed events lost and RTO should be short enough to regenerate reports before the next operator review cycle.

## Neo4j Graph Shape

Likely nodes:

- `Portfolio`
- `Program`
- `Vertical`
- `Project`
- `BranchContext`
- `IntegrationPoint`
- `Contract`
- `DependencyEdge`
- `CapabilityAdapter`
- `AlignmentRun`
- `Finding`
- `DecisionRequest`
- `DecisionRecord`
- `LearningRecord`
- `FailurePattern`
- `RiskSignal`
- `AttemptRecord`
- `Evidence`

Likely relationships:

- `PORTFOLIO_HAS_PROGRAM`
- `PROGRAM_HAS_VERTICAL`
- `PROGRAM_USES_PROJECT`
- `PROGRAM_DEPENDS_ON_PROGRAM`
- `PROJECT_HAS_BRANCH_CONTEXT`
- `VERTICAL_HAS_INTEGRATION_POINT`
- `INTEGRATION_PRODUCED_BY_PROJECT`
- `INTEGRATION_CONSUMED_BY_PROJECT`
- `INTEGRATION_GOVERNED_BY_CONTRACT`
- `DEPENDENCY_EDGE_CONNECTS`
- `ADAPTER_PROVIDES_CAPABILITY`
- `ALIGNMENT_RUN_EVALUATED_CONTRACT`
- `FINDING_AFFECTS_PROJECT`
- `FINDING_REQUIRES_DECISION`
- `LEARNING_DERIVED_FROM_ATTEMPT`
- `LEARNING_APPLIES_TO_PROGRAM`
- `FAILURE_PATTERN_AFFECTS_CONTRACT`
- `RISK_SIGNAL_AFFECTS_INTEGRATION`
- `DECISION_SUPERSEDES_DECISION`
- `RECEIPT_PRODUCED_EVIDENCE`

When Neo4j constraints, indexes, seed data, or cp-graph repository methods are added, update `@cp-graph` or the owning cp-graph package, bootstrap scripts, repository tests, and smoke assertions in the same batch.

## Operational Contracts Before Phase 4

These are not optional polish items. They define whether PMO can be trusted once execution agents and multiple portfolios depend on it.

### Tenant And Portfolio Isolation

- `portfolioId` is an isolation boundary, not only a filter field.
- All repository methods must require either a portfolio-scoped actor authority or an explicit cross-portfolio authority.
- Cross-portfolio queries are denied by default and must emit an audit event when allowed.
- Neo4j constraints and query helpers must include `portfolioId` on PMO-owned nodes/relationships that can affect planning, receipts, decisions, evidence, or reports.

### Authentication Trust Root

- Client-supplied `actorId` is never authoritative.
- The MCP host/server must authenticate callers through a declared trust root before stamping actor identity. Acceptable v1 mechanisms: OIDC/JWT issuer validation, mTLS service identity, or a host-provided signed identity envelope.
- PMO authz checks use the server-verified actor id, role, scopes, and portfolio grants. Payload actor fields are retained only as claimed metadata.

### Adapter Health Protocol

```ts
export const ProgramAdapterHealthSchema = z.object({
  schemaVersion: z.literal("1"),
  adapterId: z.string(),
  status: z.enum(["healthy", "degraded", "unavailable", "circuit_open"]),
  checkedAt: z.string(),
  sourceCursor: z.string().optional(),
  latencyMs: z.number().int().optional(),
  errorRate: z.number().optional(),
  staleCursorSeconds: z.number().int().optional(),
  limitations: z.array(z.string()).default([]),
  evidenceRefs: z.array(z.string()).default([]),
});
```

Degraded-mode behavior:

- `healthy`: adapter output may participate in deterministic core.
- `degraded`: PMO may plan only if the affected action/result states clearly name degraded confidence and include a `tool_health_degradation` risk.
- `unavailable`: PMO must not claim current observed state from that adapter; impact and reconciliation results should include an explicit gap.
- `circuit_open`: PMO skips adapter calls until the next retry window and uses last known cursor only as stale context.

### Schema Versioning

- Every persisted PMO DTO and event carries `schemaVersion`.
- Append-only events must have reducer/migration versions so replay can rebuild old events into current projections.
- Breaking schema changes require dual-read tests over at least one old fixture and one current fixture.

### Data Retention And PII

- `retentionPolicyRef` must resolve to a concrete policy before Phase 4.
- Audit events may store actor ids, service ids, timestamps, and evidence refs, but must not inline secrets, provider prompts, raw transcripts, screenshots, or full logs.
- Erasure requests should tombstone or pseudonymize actor-identifying metadata where policy allows, while preserving non-identifying audit facts and content hashes.

### Observability

PMO should emit OpenTelemetry traces and metrics with `traceId`, `correlationId`, `programId`, `portfolioId`, `adapterId`, and `flightPlanId` where applicable.

Minimum metrics:

- `pmo_flight_plans_generated_total`
- `pmo_flight_plan_revalidation_required_total`
- `pmo_receipts_recorded_total`
- `pmo_receipts_missing_count`
- `pmo_receipts_conflicting_count`
- `pmo_propagation_suppressed_total`
- `pmo_desync_findings_open`
- `pmo_adapter_health_status`
- `pmo_state_replay_duration_ms`
- `pmo_report_generation_duration_ms`

Minimum alerts:

- high `pmo_receipts_missing_count` for critical programs
- any critical `pmo_desync_findings_open`
- adapter `circuit_open` beyond its retry window
- replay failure or state hash mismatch in rebuild smoke tests

## Phased Delivery Plan

### Phase 0: Design Contract

Deliver:
- ADR: Program Manager is a stateful memory service with its own DB
- implementation decision: TypeScript + Neo4j-backed cp-graph repository
- cp-program-manager architecture spec
- cp-program-manager data model spec, starting with `DependencyEdge` and `ArtifactRef`
- artifact registry spec
- HITL/audit gate cp-graph spec
- portfolio, temporal fact, and context-anchor model
- cross-program learning taxonomy and proactive signal rules
- shared schema proposal
- `ProgramImpactAssessmentRequestSchema` and `ProgramImpactAssessmentResultSchema`
- deterministic `stateVersionHash` and `flightPlanHash` spec
- receipt due policy and flight-plan staleness semantics
- adapter manifest shape
- adapter health protocol
- public MCP tool contract
- schema versioning and event replay policy
- sample program registry for Hoplon/Phalanx/Semantix/Guardrail/Program Manager MCP

Validation:
- schema tests
- contract examples parse
- data model examples parse
- Cypher examples parse/run against fixture cp-graph
- impact assessment request/result examples parse
- adapter conformance fixture suite defined for manifest, `assessImpact`, health, sync cursor, and reconciliation behavior
- deterministic fixture defines expected `stateVersionHash` for seed cp-graph G0
- no runtime mutation

### Phase 1: Read-Only Program Manager MVP

Deliver:
- `cp-program-manager` package or MCP mcp-gateway module
- Program Manager repository interface
- Neo4j-backed cp-graph repository
- Neo4j migration/constraint bootstrap for PMO labels and relationships
- fixture cp-graph seed for Hoplon/Phalanx/Semantix/Guardrail/Program Manager MCP
- artifact registry metadata store
- adapter sync cursor model
- portfolio/program/project membership store
- temporal fact and context-anchor query support
- read-only learning and attempt records derived from seeded fixtures
- `list_program_capabilities`
- `get_program_documentation`
- `query_program_context`
- `assess_program_impact`
- `analyze_program_intelligence`
- read-only adapter manifests for LLM Tracker and Hoplon
- generated alignment report under `artifacts/reports/alignment/`

Validation:
- repository unit tests
- Neo4j repository integration tests
- unit tests for adapter registry
- unit tests for impact assessment
- tests prove blast-radius traversal returns affected projects/contracts/tracker tasks from fixture cp-graph
- fixture-pinned test: given seed cp-graph G0 and changeset C0, `assess_program_impact` returns exactly findings F0 and affected refs A0
- tests prove unsatisfied HITL approval gates appear as hard blocks in flight plans
- unit tests for context-anchor projections across branch/commit/tracker revision
- tests prove superseded, discarded, and future-not-applicable decisions are not applied to the wrong branch/time context
- tests prove cross-program learning queries return evidence-backed issue cards
- tests prove Program Manager can reconstruct program state from event store, PMO registry/manifests, cp-graph rebuild, and adapter reads without chat history
- tests prove generated reports can be deleted and reproduced without information loss
- no mutation capability
- redaction tests
- control-plane boundary check

### Phase 2: Flight Plans And Receipt Requirements

Deliver:
- `plan_program_action`
- deterministic flight-plan planner
- expected receipt model
- tracker update proposals
- decision request proposals
- evidence obligation calculation
- proactive learning/risk analysis over changed facts
- proposals for issues found from failed attempts, discarded decisions, stale evidence, repeated blockers, and contract drift

Validation:
- tests prove no tracker writes occur by default
- tests prove affected projects/contracts are detected
- tests prove missing evidence blocks or warns on flight plans
- tests prove circular propagation is suppressed using propagation ancestry
- tests prove repeated flight plans are stable under the same `stateVersionHash`, context anchor, proposed change, adapter manifest versions, and deterministic rule versions
- tests prove model-assisted advisory output is excluded from `flightPlanHash`
- tests prove stale or expired flight plans require revalidation before satisfying receipts
- tests prove proactive findings are explainable and include deterministic trigger/evidence refs
- tests prove discarded decisions suppress or warn on repeating rejected approaches under typed condition-tag matching

### Phase 3: Receipt Ledger And Reconciliation

Deliver:
- `record_program_receipt`
- `reconcile_program_state`
- expected-vs-observed receipt ledger
- audit event persistence
- approval/evidence receipt validation
- policy checks for actor/scope
- desynchronized-state findings

Validation:
- receipt validation tests
- audit tests
- authz rejection tests
- duplicate receipt/idempotency tests
- stale flight-plan receipt tests
- due-policy timing tests for `in_flight`, `late`, `lost`, and `stuck_flight_plan`
- forged/incomplete receipt tests covering digest mismatch, missing signature, and unavailable adapter observation
- propagation loop-suppression tests
- reconciliation tests where one expected receipt is present and another is missing
- conflicting-state tests where a receipt contradicts adapter-observed state
- desynchronization report tests

### Phase 4: Agentic OS Integration

Deliver:
- Program Manager agent can receive pointer-only context packets
- execution agents use their own authorized tools and submit PMO receipts
- Agentic OS consumes Program Manager Neo4j cp-graph refs/state
- operator progress reports generated from durable state

Validation:
- context-packet tests
- Neo4j constraint/index/repository tests
- audit and trace replay tests
- tenant/portfolio isolation tests
- auth trust-root tests
- adapter degraded-mode and circuit-breaker tests
- schema migration/replay tests
- retention/redaction policy tests
- OpenTelemetry trace and metric smoke tests
- cp-program-manager workflow smoke

## MVP Acceptance Criteria

Phase 1 is done when:

- A user or agent can ask "what tool/capability should handle this program task?"
- Program Manager returns a concise capability match and documentation topic.
- Program Manager persists portfolios, programs, projects, branch contexts, integration points, contracts, dependencies, decisions, discarded decisions, attempts, learnings, findings, risk signals, evidence refs, artifact refs, action ledger entries, and sync cursors through its own repository.
- Program Manager can read LLM Tracker status through its adapter.
- Program Manager can read Hoplon/code context through its adapter or safe stub.
- Program Manager can produce a markdown alignment report.
- Given fixture seed cp-graph G0 and changeset C0, Program Manager returns exactly the fixture-pinned affected refs A0 and findings F0, including at least one cross-project dependency and one stale/missing evidence condition from static registry plus tracker state.
- Program Manager can identify at least one cross-program learning or risk from persisted facts.
- Program Manager can tell whether a decision is applicable, superseded, discarded, or future-not-applicable for a branch/commit/tracker-revision context.
- Program Manager can recreate the same high-level program update from persisted memory plus adapter reads without relying on LLM conversation state, and the regenerated report has the same deterministic evidence refs.
- Program Manager does not execute downstream mutations.
- All outputs carry evidence refs and provenance.
- Redaction tests prove prohibited payload kinds are not returned inline.

## First Program Registry Seed

Create a seed registry with at least these projects:

```json
[
  { "projectId": "cp-program-manager-mcp", "name": "Program Manager MCP" },
  { "projectId": "hoplon", "name": "Hoplon" },
  { "projectId": "phalanx", "name": "Project Phalanx" },
  { "projectId": "semantix", "name": "Semantix" },
  { "projectId": "guardrail", "name": "Guardrail" }
]
```

Seed integration points:

- `mcp-gateway`: Hoplon authz contracts consumed by Phalanx.
- `llm-tracker-program-state`: tracker status consumed by Program Manager.
- `semantix-readiness-spec-flow`: Semantix readiness/spec workflow consumed by Agentic OS planning.
- `guardrail-runtime-controls`: Guardrail execution/policy constraints consumed by Agentic OS runtime/provider orchestration.
- `phalanx-orchestration`: Phalanx orchestration state consumed by Agentic OS program workflows.

## Open Questions For Implementing Agent

- Should Phase 1 live inside `control-plane/mcp-gateway/` or a new `control-plane/packages/cp-program-manager/` package with MCP mcp-gateway exports?
- Which project IDs does Hoplon currently register for Hoplon, Hoplon, Phalanx, Semantix, and Guardrail?
- Should the first tracker adapter use the LLM Tracker MCP client, local tracker JSON reads, or the tracker CLI/API?
- Should the first generated alignment report be markdown only, or markdown plus JSON evidence envelope?
- Does the current MCP host allow Program Manager to call other MCP servers directly, or should every downstream capability be wrapped through native CLI/API/file adapters?

Default recommendation:

- Create a separate `cp-program-manager` package and expose it through `mcp-gateway`.
- Use local file/API adapters first instead of depending on MCP-to-MCP support.
- Generate markdown plus JSON for reports.
- Keep external execution outside Program Manager; use flight plans plus receipts.

## Verification Menu

Use the narrowest checks per phase:

- `TPF_LLM_TOOL=codex tpf pnpm exec vitest run tests/unit/agent-os-schemas.test.ts`
- `TPF_LLM_TOOL=codex tpf pnpm --filter @control-plane exec vitest run --config vitest.config.ts tests/unit/cp-program-manager/*.test.ts`
- `TPF_LLM_TOOL=codex tpf pnpm --filter @control-plane run typecheck`
- `TPF_LLM_TOOL=codex tpf pnpm run control-plane:check:boundaries`
- Add `pnpm --filter @control-plane run test:unit` before closing any phase that touches shared control-plane behavior.

## Delivery Notes

- Keep reports under `artifacts/reports/alignment/`.
- Keep implementation evidence under `artifacts/reports/implementation/`.
- Update `control-plane/AGENTS.md` if the implementation adds new cp-program-manager rules around adapters, authz, audit, tracing, propagation, or context projection.
- Update root `AGENTS.md` only if the general MCP triage guidance changes.
- Do not mark tracker tasks complete unless the relevant portability, evidence, and verification gates are satisfied or explicitly deferred.
