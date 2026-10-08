import pg from "pg";
import * as schema from "./schema";
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
export declare function poolConfigFor(rawUrl: string, ssl?: string | undefined): pg.PoolConfig;
/** Where the app is connecting, without the password. For the startup log, so a wrong URL is easy to spot. */
export declare function databaseTarget(): {
    host: string;
    port: string;
    user: string;
    database: string;
    source: string;
};
export declare const pool: import("pg").Pool;
export declare const db: import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema> & {
    $client: import("pg").Pool;
};
export * from "./schema";
//# sourceMappingURL=index.d.ts.map