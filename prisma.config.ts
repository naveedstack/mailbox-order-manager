import "dotenv/config";
import { defineConfig } from "prisma/config";

// Read leniently: `prisma generate` (npm postinstall) needs no database, so a
// fresh clone must install before .env exists. Commands that do need the
// database still fail with a clear "no URL" error.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
