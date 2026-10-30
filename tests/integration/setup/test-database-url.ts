// Integration tests never touch the dev database: they use the same server with
// the database name swapped to `<name>_test` (or TEST_DATABASE_URL if set).
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  const devUrl = process.env.DATABASE_URL;
  if (!devUrl) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  }
  const url = new URL(devUrl);
  url.pathname = `${url.pathname.replace(/^\//, "")}_test`;
  return url.toString();
}
