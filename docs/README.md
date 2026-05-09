# Program Manager MCP Documentation

This directory contains both current agent/operator docs and historical phase contracts.

For normal use, start here:

- [Omni-tool agent guide](./omni-tool-agent-guide.md): explains the five-tool PMO surface, tradeoffs, examples, and runtime guidance model.
- [Agent PMO onboarding](./agent-pmo-onboarding/README.md): step-by-step autonomous agent loop, canonical shared-flow refs, and receipt behavior.
- [Receipt protocol](./agent-pmo-onboarding/receipt-protocol.md): execution receipt shape and pointer-only submission rules.
- [Public tool contracts and result envelope](./phase-0/public-pmo-tool-contracts-and-result-envelope.md): contract-level envelope and public tool design.
- [Stateful PMO ADR](./phase-0/adr-pmo-stateful-memory-service.md): why PMO owns durable memory and remains passive.

## What This MCP Helps With

Program Manager MCP helps agents and humans coordinate cross-project software work by keeping PMO-owned memory about programs, projects, integrations, blockers, gaps, decisions, evidence refs, artifact refs, expected receipts, observed receipts, and reconciliation findings.

It is especially useful when:

- an agent needs safe startup guidance before touching code
- multiple projects share an integration contract
- a human wants current blocker or evidence status without reading chat history
- a team needs to know the impact of changing a shared dependency
- execution happened outside PMO and needs pointer-only proof
- agents worked in parallel and someone needs drift detection before signoff

## Current Public Tool Surface

Program Manager MCP exposes five public PMO tools:

- `pmo_help`
- `manage_projects`
- `manage_integrations`
- `manage_evidence_items`
- `pmo_macro`

This domain omni-tool approach gives agents a small public surface while still keeping PMO state organized by domain. It saves time by routing agents at runtime, returning structured repair guidance for bad payloads, and keeping humans out of repetitive status reconstruction.

## Documentation Notes

The `phase-*` directories include design contracts and acceptance proofs from implementation phases. Some Phase 0 documents describe initial narrow tool contracts because they were written before the current five-tool omni surface was finalized. Treat the README, this docs index, the omni-tool agent guide, agent onboarding docs, and Phase 5 macro acceptance proof as the current agent-facing orientation.
