import { createHash } from "node:crypto";

const NON_DETERMINISTIC_KEYS = new Set([
  "advisory",
  "advisoryPane",
  "advisoryText",
  "artifactBody",
  "artifactContent",
  "generatedAt",
  "generatedTimestamp",
  "logBody",
  "modelAssistedSummary",
  "modelSummary",
  "rawArtifact",
  "rawArtifacts",
  "rawLog",
  "rawLogs",
  "scratchpad",
  "scratchpads",
  "screenshot",
  "screenshotBytes",
  "transcript",
  "transcripts"
]);

function compareDeterministicStrings(left, right) {
  return left.localeCompare(right);
}

function isObject(value) {
  return value !== null && typeof value === "object";
}

export function canonicalizeForStateVersionHash(value) {
  if (!isObject(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    const canonicalItems = value.map(canonicalizeForStateVersionHash);
    if (canonicalItems.every((item) => typeof item === "string")) {
      return [...canonicalItems].sort(compareDeterministicStrings);
    }
    return canonicalItems;
  }

  const out = {};
  for (const key of Object.keys(value).sort(compareDeterministicStrings)) {
    if (NON_DETERMINISTIC_KEYS.has(key)) {
      continue;
    }
    out[key] = canonicalizeForStateVersionHash(value[key]);
  }
  return out;
}

export function sha256ForInput(input) {
  const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return `sha256:${digest}`;
}

export function stateVersionHashFromInput(input) {
  return sha256ForInput(canonicalizeForStateVersionHash(input));
}

export function collectNondeterministicHashKeys(value, path = []) {
  if (!isObject(value)) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectNondeterministicHashKeys(item, [...path, `[${index}]`]));
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const nextPath = [...path, key];
    const children = collectNondeterministicHashKeys(child, nextPath);
    if (NON_DETERMINISTIC_KEYS.has(key)) {
      return [nextPath.join(".")].concat(children);
    }
    return children;
  });
}

export function isSortedByField(entries, field) {
  const values = entries.map((entry) => entry[field]);
  const sorted = [...values].sort(compareDeterministicStrings);
  return values.every((value, index) => value === sorted[index]);
}
