import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";

import { programManagerSchemaRegistry } from "./program-manager.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const generatedDir = path.join(__dirname, "generated");

function sortJson(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, sortJson(item)])
    );
  }

  return value;
}

export function generateJsonSchemas() {
  return Object.fromEntries(
    Object.entries(programManagerSchemaRegistry).map(([fileName, schema]) => {
      const title = fileName.replace(/\.schema\.json$/, "");
      const jsonSchema = zodToJsonSchema(schema, {
        $refStrategy: "none",
        name: title,
        target: "jsonSchema7"
      });

      return [fileName, sortJson(jsonSchema)];
    })
  );
}

export async function writeJsonSchemas() {
  const schemas = generateJsonSchemas();
  await mkdir(generatedDir, { recursive: true });

  await Promise.all(
    Object.entries(schemas).map(([fileName, schema]) =>
      writeFile(path.join(generatedDir, fileName), `${JSON.stringify(schema, null, 2)}\n`, "utf8")
    )
  );

  return schemas;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  await writeJsonSchemas();
}
