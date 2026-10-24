import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationDir = resolve(process.cwd(), "apps/api/migrations");
const files = readdirSync(migrationDir)
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/i.test(name))
  .sort();

assert.ok(files.length > 0, "No numbered SQL migrations were found.");

const numbers = files.map((name) => Number(name.slice(0, 4)));
for (let index = 0; index < numbers.length; index += 1) {
  const expected = index + 1;
  assert.equal(
    numbers[index],
    expected,
    `Migration sequence must be contiguous: expected ${String(expected).padStart(4, "0")}, found ${files[index]}.`,
  );
}

for (const file of files) {
  const sql = readFileSync(resolve(migrationDir, file), "utf8").trim();
  assert.ok(sql.length >= 20, `${file} is unexpectedly empty.`);
  assert.doesNotMatch(sql, /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY\s*=|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i, `${file} appears to contain a credential.`);
}

console.log(`Verified ${files.length} contiguous migrations (${files[0]} … ${files.at(-1)}).`);
