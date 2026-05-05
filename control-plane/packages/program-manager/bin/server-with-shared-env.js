#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";

function parseDotenv(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values.set(key, value);
  }
  return values;
}

function setIfMissing(key, value) {
  if (!process.env[key] && value) {
    process.env[key] = value;
  }
}

const envFile = process.env.PMO_SHARED_NEO4J_ENV_FILE;

if (envFile && existsSync(envFile)) {
  const values = parseDotenv(readFileSync(envFile, "utf8"));
  setIfMissing("PMO_NEO4J_URI", values.get("CP_NEO4J_BOLT_URL"));
  setIfMissing("PMO_NEO4J_USERNAME", values.get("CP_NEO4J_USER"));
  setIfMissing("PMO_NEO4J_PASSWORD", values.get("CP_NEO4J_PASSWORD"));
  setIfMissing("PMO_NEO4J_DATABASE", values.get("CP_NEO4J_DATABASE"));
}

setIfMissing("PMO_STORAGE_BACKEND", "neo4j");
setIfMissing("PMO_NEO4J_SYSTEM_REF", "system://program-manager/shared-knowledge");
setIfMissing("PMO_MCP_ACTOR_ROLE", "program_manager_agent");

await import("./server.js");
