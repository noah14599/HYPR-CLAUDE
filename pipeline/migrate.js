// Applies every db/*.sql file that hasn't run yet, in filename order, and records it.
// Safe to run any time: files that already ran are skipped.
const fs = require("fs");
const path = require("path");
const { connect } = require("./db");

const DIR = path.join(__dirname, "..", "db");

(async () => {
  const db = connect();
  await db.connect();
  await db.query("create table if not exists public._migrations (name text primary key, ran_at timestamptz not null default now())");
  await db.query("alter table public._migrations enable row level security");
  const done = new Set((await db.query("select name from public._migrations")).rows.map(r => r.name));
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (done.has(f)) { console.log("already applied:", f); continue; }
    const sql = fs.readFileSync(path.join(DIR, f), "utf8");
    await db.query("begin");
    try {
      await db.query(sql);
      await db.query("insert into public._migrations (name) values ($1)", [f]);
      await db.query("commit");
      console.log("applied:", f);
    } catch (e) {
      await db.query("rollback");
      console.error("FAILED:", f, "-", e.message);
      process.exitCode = 1;
      break;
    }
  }
  await db.end();
})();
