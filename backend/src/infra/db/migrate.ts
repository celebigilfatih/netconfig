import fs from "node:fs";
import path from "node:path";
import { db } from "./client.js";

async function main() {
  const file = path.resolve(process.cwd(), "src/infra/db/schema.sql");
  const sql = fs.readFileSync(file, "utf8");
  const client = await db.connect();
  try {
    await client.query(sql);
    console.log("migrate: ok");
  } finally {
    client.release();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

