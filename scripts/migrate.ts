import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const databasePath = path.resolve(
  process.cwd(),
  process.env.DATABASE_URL ?? "./data/besorah.db",
);
const migrationsPath = path.resolve(process.cwd(), "migrations");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");
database.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at INTEGER NOT NULL
  )
`);

const applied = new Set(
  database
    .prepare("SELECT name FROM _migrations")
    .all()
    .map((row) => (row as { name: string }).name),
);

for (const name of fs.readdirSync(migrationsPath).filter((file) => file.endsWith(".sql")).sort()) {
  if (applied.has(name)) continue;
  const sql = fs.readFileSync(path.join(migrationsPath, name), "utf8");
  database.transaction(() => {
    database.exec(sql);
    database
      .prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
      .run(name, Date.now());
  })();
  process.stdout.write(`Applied ${name}\n`);
}

database.close();
