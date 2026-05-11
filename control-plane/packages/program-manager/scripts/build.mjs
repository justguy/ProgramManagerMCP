import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path, { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packageRoot, "..", "..", "..");
const sourceRoot = join(packageRoot, "src");
const stageRoot = join(packageRoot, ".build-src");
const distRoot = join(packageRoot, "dist");
const sharedSchemaSource = join(repoRoot, "shared", "schemas", "program-manager.ts");
const sharedSchemaStage = join(stageRoot, "shared", "schemas", "program-manager.ts");
const zodSafeExtendCompatibility = `
const zodObjectPrototype = Object.getPrototypeOf(z.object({}));
const zodEffectsPrototype = Object.getPrototypeOf(z.object({}).superRefine(() => {}));
function reapplyZodEffect(schema, effect) {
  return effect?.type === "refinement" ? schema.superRefine(effect.refinement) : schema;
}
if (typeof zodObjectPrototype.safeExtend !== "function") {
  Object.defineProperty(zodObjectPrototype, "safeExtend", {
    value(shape) {
      return this.extend(shape);
    }
  });
}
if (typeof zodEffectsPrototype.safeExtend !== "function") {
  Object.defineProperty(zodEffectsPrototype, "safeExtend", {
    value(shape) {
      const inner = this.innerType();
      const extended = typeof inner.safeExtend === "function" ? inner.safeExtend(shape) : inner.extend(shape);
      return reapplyZodEffect(extended, this._def?.effect);
    }
  });
}
if (typeof zodEffectsPrototype.strict !== "function") {
  Object.defineProperty(zodEffectsPrototype, "strict", {
    value() {
      const inner = this.innerType();
      const strictInner = typeof inner.strict === "function" ? inner.strict() : inner;
      return reapplyZodEffect(strictInner, this._def?.effect);
    }
  });
}
`;

function toSpecifier(value) {
  const normalized = value.split(path.sep).join("/");
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function sharedSchemaSpecifier(relativeFilePath) {
  return toSpecifier(
    relative(dirname(relativeFilePath), "shared/schemas/program-manager.js")
  );
}

function transformSource(source, relativeFilePath) {
  return source
    .replaceAll(
      "../../../../../shared/schemas/program-manager.ts",
      sharedSchemaSpecifier(relativeFilePath)
    )
    .replace(/(from\s+["'])(\.[^"']+)\.ts(["'])/g, "$1$2.js$3");
}

function copyTransformedTree(sourceDir, targetDir, relativeBase = "") {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);
    const relativePath = join(relativeBase, entry.name);

    if (entry.isDirectory()) {
      mkdirSync(targetPath, { recursive: true });
      copyTransformedTree(sourcePath, targetPath, relativePath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    if (entry.name.endsWith(".ts")) {
      writeFileSync(
        targetPath,
        transformSource(readFileSync(sourcePath, "utf8"), relativePath),
        "utf8"
      );
      continue;
    }

    writeFileSync(targetPath, readFileSync(sourcePath));
  }
}

function copyRuntimeAssets(sourceDir, targetDir) {
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name);
    const targetPath = join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyRuntimeAssets(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile() || entry.name.endsWith(".ts") || entry.name === "tsconfig.json") {
      continue;
    }

    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, readFileSync(sourcePath));
  }
}

function rewriteCompiledSharedSchemaImports() {
  const externalSharedSchemaSpecifier = "../../../../../shared/schemas/program-manager.ts";
  for (const relativePath of [
    "service/program-tool-service.js",
    "mcp/program-manager-mcp-gateway.js"
  ]) {
    const targetPath = join(distRoot, relativePath);
    if (!existsSync(targetPath)) {
      continue;
    }
    writeFileSync(
      targetPath,
      readFileSync(targetPath, "utf8").replaceAll(
        "../shared/schemas/program-manager.js",
        externalSharedSchemaSpecifier
      ),
      "utf8"
    );
  }
  rmSync(join(distRoot, "shared"), { recursive: true, force: true });
}

rmSync(stageRoot, { recursive: true, force: true });
rmSync(distRoot, { recursive: true, force: true });
mkdirSync(stageRoot, { recursive: true });

copyTransformedTree(sourceRoot, stageRoot);
mkdirSync(dirname(sharedSchemaStage), { recursive: true });
writeFileSync(
  sharedSchemaStage,
  `// @ts-nocheck\n${transformSource(readFileSync(sharedSchemaSource, "utf8"), "shared/schemas/program-manager.ts")
    .replace('import { z } from "zod";', `import { z } from "zod";\n${zodSafeExtendCompatibility}`)}`,
  "utf8"
);

writeFileSync(
  join(stageRoot, "tsconfig.json"),
  JSON.stringify(
    {
      extends: "../tsconfig.base.json",
      compilerOptions: {
        rootDir: ".",
        outDir: "../dist"
      },
      include: ["**/*.ts"]
    },
    null,
    2
  ),
  "utf8"
);

const tscCommand = process.platform === "win32" ? "tsc.cmd" : "tsc";
const result = spawnSync(tscCommand, ["-p", join(stageRoot, "tsconfig.json"), "--pretty", "false"], {
  cwd: packageRoot,
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!existsSync(join(distRoot, "index.js"))) {
  throw new Error("Build completed without producing dist/index.js");
}

copyRuntimeAssets(stageRoot, distRoot);
rewriteCompiledSharedSchemaImports();
rmSync(stageRoot, { recursive: true, force: true });
