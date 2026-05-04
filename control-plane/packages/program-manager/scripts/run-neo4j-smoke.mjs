import { spawnSync } from "node:child_process";

const CONTAINER_NAME = process.env.PMO_NEO4J_CONTAINER_NAME ?? "cp-program-manager-neo4j-smoke";
const IMAGE = process.env.PMO_NEO4J_IMAGE ?? "neo4j:5.26-community";
const URI = process.env.PMO_NEO4J_URI ?? "bolt://127.0.0.1:7687";
const USERNAME = process.env.PMO_NEO4J_USERNAME ?? "neo4j";
const PASSWORD = process.env.PMO_NEO4J_PASSWORD ?? "program-manager-smoke";
const HTTP_PORT = process.env.PMO_NEO4J_HTTP_PORT ?? "7474";
const BOLT_PORT = process.env.PMO_NEO4J_BOLT_PORT ?? "7687";
const SHOULD_MANAGE_CONTAINER = !process.env.PMO_NEO4J_URI;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: options.stdio ?? "inherit",
    env: options.env ?? process.env
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
  }
  return result;
}

function docker(args, options) {
  return run("docker", args, options);
}

function cleanup() {
  if (!SHOULD_MANAGE_CONTAINER) {
    return;
  }
  spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });
}

async function waitForNeo4j() {
  const neo4j = await import("neo4j-driver");
  const deadline = Date.now() + 90_000;
  let lastError;

  while (Date.now() < deadline) {
    const driver = neo4j.default.driver(URI, neo4j.default.auth.basic(USERNAME, PASSWORD));
    try {
      await driver.verifyConnectivity();
      await driver.close();
      return;
    } catch (error) {
      lastError = error;
      await driver.close().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1_500));
    }
  }

  throw lastError ?? new Error("Timed out waiting for Neo4j connectivity");
}

try {
  if (SHOULD_MANAGE_CONTAINER) {
    cleanup();
    docker([
      "run",
      "--rm",
      "--detach",
      "--name",
      CONTAINER_NAME,
      "--publish",
      `${HTTP_PORT}:7474`,
      "--publish",
      `${BOLT_PORT}:7687`,
      "--env",
      `NEO4J_AUTH=${USERNAME}/${PASSWORD}`,
      IMAGE
    ]);
  }

  await waitForNeo4j();

  run("node", ["--test", "tests/program-manager-graph-neo4j.test.js"], {
    env: {
      ...process.env,
      PMO_NEO4J_URI: URI,
      PMO_NEO4J_USERNAME: USERNAME,
      PMO_NEO4J_PASSWORD: PASSWORD
    }
  });
} finally {
  cleanup();
}
