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
    return { host: u.hostname, port: u.port || "5432", user: decodeURIComponent(u.username), database: u.pathname.replace(/^\//, ""), source: "DATABASE_URL" };
  } catch {
    return { host: "(DATABASE_URL could not be read as a URL)", port: "", user: "", database: "", source: "DATABASE_URL" };
  }
}

export const pool = new Pool(resolvePoolConfig());
export const db = drizzle(pool, { schema });

export * from "./schema";
