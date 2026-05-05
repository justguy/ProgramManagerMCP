import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const packageRoot = process.cwd();

const graphSourceFiles = [
  "src/types/domain.ts",
  "src/normalization/program-manager-normalization.ts",
  "src/repository/program-manager-repository.ts",
  "src/repository/program-manager-graph-store.ts",
  "src/repository/program-manager-graph-repository.ts",
  "src/repository/program-manager-neo4j-store.ts"
];

function rewriteRelativeModuleSpecifiers(source) {
  return source.replaceAll(/from "(\.[^"]+)\.(?:js|ts)"/g, 'from "$1.mjs"');
}

export async function loadGraphModules() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "program-manager-graph-"));

  for (const relativePath of graphSourceFiles) {
    const sourcePath = path.join(packageRoot, relativePath);
    const outputPath = path.join(tempRoot, relativePath.replace(/\.ts$/, ".mjs"));
    await mkdir(path.dirname(outputPath), { recursive: true });

    const source = await readFile(sourcePath, "utf8");
    const stripped = stripTypeScriptTypes(rewriteRelativeModuleSpecifiers(source), {
      mode: "strip"
    });
    await writeFile(outputPath, stripped, "utf8");
  }

  const repositoryModule = await import(
    pathToFileURL(
      path.join(tempRoot, "src/repository/program-manager-graph-repository.mjs")
    ).href
  );
  const storeModule = await import(
    pathToFileURL(
      path.join(tempRoot, "src/repository/program-manager-graph-store.mjs")
    ).href
  );
  const neo4jModule = await import(
    pathToFileURL(
      path.join(tempRoot, "src/repository/program-manager-neo4j-store.mjs")
    ).href
  );

  return {
    tempRoot,
    repositoryModule,
    storeModule,
    neo4jModule
  };
}
