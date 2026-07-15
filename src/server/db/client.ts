import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import { getEnv } from "@/server/env";

import * as schema from "./schema";

type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

let sqlite: Database.Database | undefined;
let db: AppDatabase | undefined;

export function getDatabase(): AppDatabase {
  if (db) return db;

  const databasePath = path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    getEnv().DATABASE_URL,
  );
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  sqlite = new Database(databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  return db;
}

export function closeDatabaseForTests(): void {
  sqlite?.close();
  sqlite = undefined;
  db = undefined;
}
