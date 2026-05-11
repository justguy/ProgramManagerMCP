# Program Manager MCP

Program Manager MCP is a stateful PMO memory, guidance, dependency intelligence, and receipt ledger service for coordinated agentic software programs. It gives agents one reliable place to ask what matters before, during, and after cross-project work:

- what scope they are allowed to touch
- which programs, projects, integrations, blockers, decisions, contracts, and evidence refs are relevant
- what is missing, stale, disputed, or blocked
- what actions are proposed next, and which must still be executed through project-native tools
- what pointer-only evidence or receipts are required before work can be treated as complete

The operator-facing and agent-facing capability label is **PMO**. The package is `cp-program-manager`, and the MCP server id used by this repo is `cp-program-manager`.

## Why This Exists

Multi-agent programs fail when state is spread across chat history, local repo files, trackers, ad hoc run logs, and each agent's memory. Humans lose time re-explaining context. Agents lose time guessing which tool owns a fact, probing local files, or repeating stale work.

Program Manager MCP saves that coordination time by acting like a durable PMO assistant:

- It gives agents a first call, `pmo_help`, that explains the current scope, authority model, known refs, operating rules, next calls, and receipt path.
- It keeps cross-project facts in PMO-owned memory instead of relying on a single MCP process or chat transcript.
- It returns deterministic, repairable envelopes when an agent gets a payload wrong, including allowed actions, known refs, normalization hints, `correctForm`, retry examples, warnings, and the next recommended tool.
- It keeps evidence pointer-only, so agents can coordinate through refs, digests, artifact ids, commit refs, tracker refs, and receipt refs without pasting raw logs, screenshots, transcripts, product rows, credentials, or secrets into PMO memory.
- It distinguishes PMO-owned work from downstream execution. PMO guides, analyzes, records, and reconciles; code, tracker, GitHub, deployment, product, and project-specific mutations still happen through the owning project's tools.

## Current Status

This repo contains the runnable TypeScript implementation under [control-plane/packages/program-manager](./control-plane/packages/program-manager), generated/shared schemas under [shared/schemas](./shared/schemas), Neo4j migrations, fixtures, tests, and phase acceptance documentation.

The public MCP discovery surface is intentionally small:

- `pmo_help`
- `manage_projects`
- `manage_integrations`
- `manage_evidence_items`
- `pmo_macro`

Legacy narrower tools remain callable for compatibility tests and older clients, but the current public contract is the five-tool PMO surface above.

## What PMO Does

Program Manager MCP helps agents and humans answer coordination questions such as:

- Which project owns this integration, contract, blocker, decision, or receipt?
- Has this project joined the shared integration yet?
- What blockers or gaps prevent the next agent from safely starting?
- Which decisions apply to this branch, commit, tracker revision, or as-of time?
- What is the blast radius of changing a contract or dependency?
- Which evidence refs or artifact refs are needed to close a gap?
- Did project-native execution produce the receipt PMO expected?
- What has drifted since the last shared-flow catch-up?

It owns durable PMO state for portfolios, programs, projects, integration points, contracts, coordination items, decisions, evidence refs, artifact refs, expected receipts, observed receipts, reconciliation findings, adapter cursors, reports, and append-only PMO events.

It uses Neo4j as the primary PMO graph query and projection store, with an in-memory repository only for focused tests and fixtures.

## What PMO Does Not Do

Program Manager MCP preserves a passive analyst boundary:

- PMO does not edit code.
- PMO does not write tracker tasks directly.
- PMO does not call mutation-capable downstream tools.
- PMO does not replace LLM Tracker, Hoplon, GitHub, Guardrail, Semantix, Phalanx, Serena, or other focused systems.
- PMO does not inline raw logs, screenshots, prompts, transcripts, product rows, sessions, credentials, secrets, or unbounded diffs.
- PMO plans and recommendations do not grant an execution agent extra authority.

Execution agents use their own authorized project tools, then submit pointer-only receipts or evidence refs back to PMO.

## Omni-Tool Approach

Program Manager uses a domain omni-tool design. This is a middle ground between one arbitrary "do anything" tool and dozens of tiny MCP tools.

The five public tools are broad enough that agents do not need to memorize a large tool list, but narrow enough that each tool owns a clear class of PMO state:

| Tool | Use it for | Mutates PMO state |
| --- | --- | --- |
| `pmo_help` | Bootstrap guidance, scope, authority, known PMO operating rules, setup gaps, and next calls. | No |
| `manage_projects` | PMO-owned program and project records, roles, tracker/repo/adapter pointers, and goals. | Yes |
| `manage_integrations` | Integration lifecycle, participation, contracts, gaps, blockers, decisions, responses, conflicts, learnings, tracker refs, inbox, and catch-up. | Yes |
| `manage_evidence_items` | Pointer-only evidence and artifact registry records, classifications, retention refs, and attachments. | Yes |
| `pmo_macro` | Bounded workflows over existing PMO state: catch-up, impact simulation, blocker analysis, unblock planning, drift detection, registry help, and registry validation. | Sometimes, only PMO-owned macro records |

### Why not one giant tool?

One fully generic omni-tool would be easy to call, but hard to validate. Agents could submit vague intent, mix lifecycle state with evidence state, or accidentally treat a macro summary as proof that an integration exists. That creates drift and weak auditability.

### Why not many tiny tools?

A sprawling surface makes agents spend tokens and time deciding between similar operations. It also increases failure modes when agents call the wrong low-level tool, skip setup, or miss the receipt path.

### Pros

- Agents get a small, predictable public tool list.
- Runtime help can route agents without relying on repo docs.
- Payload mistakes are repairable through deterministic guidance instead of guesswork.
- PMO state remains structured by domain, which keeps authz, idempotency, state transitions, and audit history tractable.
- Humans can inspect fewer tool contracts and understand where each kind of PMO fact lives.

### Cons

- Each domain tool has more actions and a larger schema than a single-purpose tool.
- Agents still need to respect setup order: `pmo_help`, then project/integration registration, then macros.
- Some legacy narrow tools remain callable for compatibility, so docs and clients must point agents at the five-tool surface.
- Domain omni-tools can become too broad if new actions are added without keeping ownership boundaries clear.

See [docs/omni-tool-agent-guide.md](./docs/omni-tool-agent-guide.md) for a detailed agent guide, examples, and tradeoffs.

## Runtime Guidance Model

Every public PMO response uses a standard envelope:

- `status`: `ok`, `warning`, `blocked`, `error`, or `degraded`
- `deterministicCore`: machine-checkable PMO facts, guidance, and result data
- `evidenceRefs` and `artifactRefs`: pointer-only supporting refs
- `redactionSummary`: what was omitted or protected
- `warnings`: concrete issues agents must inspect
- `nextRecommendedTool`: where the agent should go next
- `traceId` and `correlationId`: correlation for a task or handoff chain

Blocked calls are not dead ends. They are the guidance path. PMO returns known candidate refs, allowed actions, invalid field paths, `normalizationHints` for common slug-to-ref repairs, field guidance, retry examples, and often a machine-readable `correctForm`. Agents should retry from that envelope instead of mining local source files for schema details.

## Common Use Cases

### Start work with no context

Call `pmo_help` first. The response tells the agent whether shared PMO knowledge is available, which portfolio/program/project refs are known, which setup calls come next, and where receipts must go.

```json
{
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://program-manager-mcp"],
  "traceId": "trace://agent/start-docs-task",
  "correlationId": "corr://agent/start-docs-task/help"
}
```

### Register or discover program scope

Use `manage_projects` to list or upsert PMO-owned program and project records. This prevents agents from guessing project refs or treating tracker names as PMO identity.

```json
{
  "action": "list",
  "portfolioId": "portfolio://default",
  "traceId": "trace://agent/scope",
  "correlationId": "corr://agent/scope/projects"
}
```

### Coordinate a shared integration

Use `manage_integrations` for the lifecycle record, then attach participants with `add_project`. An integration is registered only when `manage_integrations get` returns the exact `integrationPointId` in `deterministicCore.integrationPoints`.

```json
{
  "action": "upsert",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "traceId": "trace://agent/shared-flow",
  "correlationId": "corr://agent/shared-flow/upsert",
  "integration": {
    "integrationPointId": "integration://agentic-os/shared-flow",
    "producerProjectId": "project://hoplon",
    "consumerProjectIds": ["project://phalanx", "project://semantix"],
    "purpose": "Keep shared-flow contracts, readiness evidence, blockers, and receipts aligned."
  },
  "evidenceRefs": ["evidence://operator/request/shared-flow-registration"]
}
```

### Catch up before changing a contract

Use `pmo_macro` only after PMO project and integration records exist.

```json
{
  "action": "invoke",
  "macroId": "macro://pmo/catch_me_up",
  "macroVersion": "1.0.0",
  "portfolioId": "portfolio://default",
  "programId": "program://agentic-os",
  "projectIds": ["project://hoplon", "project://phalanx", "project://semantix"],
  "input": {
    "targetRefs": ["integration://agentic-os/shared-flow"]
  },
  "traceId": "trace://agent/shared-flow",
  "correlationId": "corr://agent/shared-flow/catch-up"
}
```

### Simulate impact before downstream work

Use `macro://pmo/simulate_impact` to identify affected refs, approvals, evidence obligations, and warnings. This is non-persistent and proposal-only; it does not execute the change.

### Record pointer-only evidence

Use `manage_evidence_items` when PMO needs a durable pointer, hash, classification, retention ref, or attachment to a decision, learning, or integration item.

```json
{
  "action": "register",
  "portfolioId": "portfolio://default",
  "traceId": "trace://agent/evidence",
  "correlationId": "corr://agent/evidence/register",
  "evidenceItem": {
    "evidenceRef": "evidence://tests/program-manager/agent-loop-proof",
    "kind": "test_receipt",
    "artifactRef": "artifact://tests/program-manager/agent-loop-proof",
    "artifactType": "test_report",
    "storageUri": "artifact://tests/program-manager/agent-loop-proof",
    "contentHash": {
      "algorithm": "sha256",
      "value": "0000000000000000000000000000000000000000000000000000000000000000"
    }
  }
}
```

### Reconcile after project-native execution

After a project agent edits code, updates a tracker, runs tests, or changes an external system through that project's own tools, submit or link pointer-only evidence and run drift/reconciliation. PMO can then tell humans and agents whether expected receipts are satisfied, missing, stale, conflicting, or unevidenced.

## Local MCP Entry Point

Codex registration should point at the runnable stdio wrapper:

```bash
node control-plane/packages/program-manager/bin/server.js
```

For local Codex, register the shared-env wrapper instead. It reads the host-owned control-plane `.env` file, maps `CP_NEO4J_*` into `PMO_NEO4J_*`, and starts the same MCP server. This keeps database credentials out of agent prompts and out of TOML:

```toml
[mcp_servers.program-manager]
command = "node"
args = ["/Users/adilevinshtein/Documents/dev/ProgramManagerMCP/control-plane/packages/program-manager/bin/server-with-shared-env.js"]

[mcp_servers.program-manager.env]
PMO_SHARED_NEO4J_ENV_FILE = "/Users/adilevinshtein/Documents/dev/AskMrGambler/.env"
PMO_STORAGE_BACKEND = "neo4j"
PMO_NEO4J_SYSTEM_REF = "system://program-manager/shared-knowledge"
PMO_MCP_ACTOR_ROLE = "program_manager_agent"
PMO_MCP_PROJECT_GRANTS = "project://guardrail,project://hoplon,project://phalanx,project://program-manager-mcp,project://semantix,project://ask-mr-gambler"
```

Operators configure the shared PMO knowledge database once:

```bash
PMO_STORAGE_BACKEND=neo4j
PMO_NEO4J_URI=bolt://<shared-neo4j-host>:7687
PMO_NEO4J_USERNAME=neo4j
PMO_NEO4J_PASSWORD=<password>
node control-plane/packages/program-manager/bin/server.js
```

All MCP server instances must point at the same operator-owned PMO knowledge store. Startup verifies connectivity, runs migrations unless `PMO_NEO4J_RUN_MIGRATIONS=0`, writes a singleton PMO system identity, and reports knowledge-authority gaps through `pmo_help`.

If the shared store is missing or unreachable, the server still initializes so agents can call `pmo_help`. Stateful PMO tools return blocked guidance until the host fixes storage configuration. Local JSON PMO state is not supported as a runtime fallback.

## Profile-Specific MCP Registrations

Different agents can register separate PMO MCP entries that point at the same server and shared backing store. The registration name and `PMO_MCP_VIEW_PROFILE` describe the agent-facing projection; the role and grant variables describe the actor authority PMO verifies for that connection.

Use profiles to reduce context and tool surface, not to replace authorization. PMO mutation remains governed by actor role, portfolio, program, project grants, and deterministic validation returned by blocked PMO calls.

Recommended profiles:

- `summary`: aggregate status, catch-up, drift, and decision summaries; should be read-only.
- `operator`: detailed read access for coordination, dependency inspection, and evidence pointer review.
- `executor`: execution coordination plus pointer-only updates, receipts, gap reports, blocker updates, and reconciliation.
- `auditor`: evidence registry, decisions, drift, and reconciliation views for review and compliance work.

Example registrations:

```toml
[mcp_servers.pmo-summary]
command = "node"
args = ["/Users/adilevinshtein/Documents/dev/ProgramManagerMCP/control-plane/packages/program-manager/bin/server-with-shared-env.js"]

[mcp_servers.pmo-summary.env]
PMO_SHARED_NEO4J_ENV_FILE = "/Users/adilevinshtein/Documents/dev/AskMrGambler/.env"
PMO_STORAGE_BACKEND = "neo4j"
PMO_NEO4J_SYSTEM_REF = "system://program-manager/shared-knowledge"
PMO_MCP_VIEW_PROFILE = "summary"
PMO_MCP_ACTOR_ROLE = "summary_agent"
PMO_MCP_PROGRAM_GRANTS = "program://agentic-os"
PMO_MCP_PROJECT_GRANTS = "project://hoplon,project://phalanx,project://semantix"

[mcp_servers.pmo-executor]
command = "node"
args = ["/Users/adilevinshtein/Documents/dev/ProgramManagerMCP/control-plane/packages/program-manager/bin/server-with-shared-env.js"]

[mcp_servers.pmo-executor.env]
PMO_SHARED_NEO4J_ENV_FILE = "/Users/adilevinshtein/Documents/dev/AskMrGambler/.env"
PMO_STORAGE_BACKEND = "neo4j"
PMO_NEO4J_SYSTEM_REF = "system://program-manager/shared-knowledge"
PMO_MCP_VIEW_PROFILE = "executor"
PMO_MCP_ACTOR_ROLE = "program_manager_agent"
PMO_MCP_PROGRAM_GRANTS = "program://agentic-os"
PMO_MCP_PROJECT_GRANTS = "project://guardrail,project://hoplon,project://phalanx,project://program-manager-mcp,project://semantix,project://ask-mr-gambler"
```

## Documentation Map

- [Docs index](./docs/README.md): current docs entry point and historical phase doc notes.
- [Agent PMO onboarding](./docs/agent-pmo-onboarding/README.md): agent-first operating loop and shared-flow refs.
- [Omni-tool agent guide](./docs/omni-tool-agent-guide.md): public tool design, pros and cons, payload examples, and runtime guidance.
- [Receipt protocol](./docs/agent-pmo-onboarding/receipt-protocol.md): execution receipt shape and PMO submission path.
- [Public tool contracts and result envelope](./docs/phase-0/public-pmo-tool-contracts-and-result-envelope.md): contract-level tool and envelope details.
- [Stateful PMO ADR](./docs/phase-0/adr-pmo-stateful-memory-service.md): design boundary for PMO-owned memory and passive execution posture.
- [Phase acceptance proofs](./docs): implemented behavior by phase.

## Verification

From the package root:

```bash
cd control-plane/packages/program-manager
TPF_LLM_TOOL=codex tpf npm test
TPF_LLM_TOOL=codex tpf npm run typecheck
TPF_LLM_TOOL=codex tpf npm run pmo:agent-loop-proof
TPF_LLM_TOOL=codex tpf npm run pmo:mcp-runtime-smoke
```

Neo4j-backed tests require a configured database or the disposable smoke runner:

```bash
cd control-plane/packages/program-manager
TPF_LLM_TOOL=codex tpf npm run smoke:neo4j
```

## Contribution Rules

Any implementation change affecting schemas, adapters, graph shape, authz, evidence, receipts, tool envelopes, deterministic hashes, PMO state transitions, or report outputs must update the relevant docs and fixtures in the same change.

Changes that add a new PMO capability must also update its adapter manifest, conformance expectations, evidence behavior, health behavior, cursor behavior, and no-mutation guarantees.
