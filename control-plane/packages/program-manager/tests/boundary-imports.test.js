import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function collectTypeScriptFiles(rootDir) {
  const entries = readdirSync(rootDir);
  const files = [];

  for (const entry of entries) {
    const absolute = join(rootDir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...collectTypeScriptFiles(absolute));
      continue;
    }
    if (absolute.endsWith(".ts")) {
      files.push(absolute);
    }
  }

  return files;
}

test("package does not import product app/server modules", () => {
  const srcDir = join(process.cwd(), "src");
  const files = collectTypeScriptFiles(srcDir);
  const disallowedPatterns = ["/app/", "/server/", "control-plane/apps/", "control-plane/server/"];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    for (const pattern of disallowedPatterns) {
      assert.equal(content.includes(pattern), false, `${file} includes disallowed pattern ${pattern}`);
    }
  }
});
