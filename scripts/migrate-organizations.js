import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runOrganizationMigration } from "../store.js";

const __dirname = process.cwd();

try {
  await loadLocalEnv();
  const summary = await runOrganizationMigration({
    dbUrl: process.env.FORCE_LOCAL_JSON_STORE === "1" ? "" : process.env.DATABASE_URL,
    dataFile: process.env.DATA_FILE_PATH || ".local-db.json"
  });
  console.log("Organization migration summary:");
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = 0;
} catch (error) {
  console.error(`Organization migration failed: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
}

async function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env.local");
  if (!existsSync(envPath)) {
    return;
  }

  const raw = await readFile(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function safeErrorMessage(error) {
  const message = String(error?.code || error?.message || "Unknown error");
  return message.replace(/:\/\/[^:@\s]+:[^@\s]+@/g, "://<redacted>:<redacted>@");
}
