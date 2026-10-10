import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

/**
 * The database can be given in two ways:
 *   1. DATABASE_URL            one connection string (special characters in the password must be %-encoded)
 *   2. DB_HOST, DB_USER, DB_PASSWORD [, DB_PORT (5432), DB_NAME (postgres)]
 *                              separate values; the password is used exactly as typed, no encoding needed.
 *                              If DB_HOST is set, these are used and DATABASE_URL is ignored.
 */
if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
  throw new Error(
    "DATABASE_URL (or DB_HOST + DB_USER + DB_PASSWORD) must be set. Did you forget to provision a database?",
  );
}

/**
 * Connection settings. Hosted databases such as Supabase only accept SSL connections, and their
 * certificate is not signed by a public authority, so the certificate chain is not verified (the
 * connection is still encrypted). When SSL is used, `sslmode` is removed from the URL: the pg
 * driver would otherwise let it override this choice with a strict check that Supabase fails.
 *
 *   DATABASE_SSL=on | off   force SSL on or off
 *   otherwise SSL is used when the URL says sslmode=require/prefer/verify-* or the host is Supabase,
 *   and not used for sslmode=disable or a plain local/Replit database.
 */
export function poolConfigFor(rawUrl: string, ssl: string | undefined = process.env.DATABASE_SSL): pg.PoolConfig {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { connectionString: rawUrl }; // unusual URL: leave it entirely to the driver
  }
  const mode = url.searchParams.get("sslmode")?.toLowerCase() ?? null;
  const forced = ssl?.trim().toLowerCase();
  const useSsl =
    forced === "on" ? true
    : forced === "off" ? false
    : mode ? mode !== "disable"
    : /(^|\.)supabase\.(co|com)$/i.test(url.hostname);
  if (!useSsl) return { connectionString: rawUrl };
  url.searchParams.delete("sslmode");
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } };
}

function sslFor(host: string, ssl: string | undefined = process.env.DATABASE_SSL): pg.PoolConfig["ssl"] {
  const forced = ssl?.trim().toLowerCase();
  const useSsl = forced === "on" ? true : forced === "off" ? false : /(^|\.)supabase\.(co|com)$/i.test(host);
  return useSsl ? { rejectUnauthorized: false } : undefined;
}

function resolvePoolConfig(): pg.PoolConfig {
  const host = process.env.DB_HOST?.trim();
  if (host) {
    return {
      host,
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER?.trim(),
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME?.trim() || "postgres",
      ssl: sslFor(host),
    };
  }
  return poolConfigFor(process.env.DATABASE_URL as string);
}

/** Where the app is connecting, without the password. For the startup log, so a wrong URL is easy to spot. */
export function databaseTarget(): { host: string; port: string; user: string; database: string; source: string } {
  const host = process.env.DB_HOST?.trim();
  if (host) {
    return { host, port: String(Number(process.env.DB_PORT) || 5432), user: process.env.DB_USER?.trim() ?? "", database: process.env.DB_NAME?.trim() || "postgres", source: "DB_HOST" };
  }
  try {
    const u = new URL(process.env.DATABASE_URL as string);
    // A malformed URL can leave the password inside any of these parts, so anything that does not
    // look like a plain name is hidden rather than logged.
    const plain = (v: string) => (/^[A-Za-z0-9_.-]{0,80}$/.test(v) ? v : "(unreadable: check the URL format)");
    return {
      host: plain(u.hostname),
      port: u.port || "5432",
      user: plain((() => { try { return decodeURIComponent(u.username); } catch { return u.username; } })()),
      database: plain(u.pathname.replace(/^\//, "")),
      source: "DATABASE_URL",
    };
  } catch {
    return { host: "(DATABASE_URL could not be read as a URL)", port: "", user: "", database: "", source: "DATABASE_URL" };
  }
}

/**
 * Hosted databases (Supabase) close idle connections and can go quiet without telling the driver, which
 * then waits forever and the screen shows a spinner that never ends. These limits make every wait end:
 * a connection that cannot be made in 10 s, or a query that takes over 20 s, fails with a clear error
 * instead of hanging, idle connections are recycled before the host drops them, and TCP keep-alive
 * notices dead ones.
 */
const POOL_LIMITS: pg.PoolConfig = {
  max: Number(process.env.DB_POOL_MAX) || 8,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
  query_timeout: 20_000,
  keepAlive: true,
};

export const pool = new Pool({ ...resolvePoolConfig(), ...POOL_LIMITS });
// An idle connection that the host closes raises an 'error' event; without a listener it would crash the server.
pool.on("error", (err) => {
  console.error("Database connection error (idle client removed):", err.message);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
