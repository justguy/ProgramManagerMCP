import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("Phase 5 PMO macro acceptance proof documents determinism and safety gates", () => {
  const proof = readFileSync(
    join(process.cwd(), "../../../docs/phase-5/pmo-macro-acceptance.md"),
    "utf8"
  );

  for (const required of [
    "single public PMO macro surface",
    "Determinism",
    "Relevant state sensitivity",
    "Advisory isolation",
    "Portfolio isolation",
    "Pointer-only output",
    "Registry safety",
    "No downstream mutation",
    "Simulation boundary",
    "Residual Later-Phase Work"
  ]) {
    assert.match(proof, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
