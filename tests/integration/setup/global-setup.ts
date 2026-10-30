// Runs once before the integration project: creates the test database if it is
// missing and applies migrations. Doesn't rely on docker-entrypoint-initdb.d,
// which only runs on a fresh volume.
import { execSync } from "node:child_process";
import { Client } from "pg";
import { testDatabaseUrl } from "./test-database-url";

export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
  const dbName = url.pathname.replace(/^\//, "");

  // Connect to the maintenance database to run CREATE DATABASE.
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const client = new Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [
      dbName,
    ]);
    // Identifiers can't be parameterized; quote it.
    const quoted = `"${dbName.replace(/"/g, '""')}"`;
    if (!rowCount) {
      await client.query(`CREATE DATABASE ${quoted}`);
    }
    // Run tests in a non-UTC zone. Docker's Postgres defaults to UTC, which
    // hides bugs where SQL writes local time next to Prisma's UTC values.
    await client.query(`ALTER DATABASE ${quoted} SET timezone TO 'Asia/Karachi'`);
  } finally {
    await client.end();
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: "pipe",
  });
}
