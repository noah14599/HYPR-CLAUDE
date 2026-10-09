// Stores the two values the scheduler needs in Supabase Vault (encrypted inside the database), read from ../.env:
// the project's web address and the private password for calling the collector. Safe to run again.
//   npm run setup-schedule
const { connect } = require("./db");

(async () => {
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) throw new Error("SUPABASE_URL and CRON_SECRET must be set in .env");
  const db = connect();
  await db.connect();
  for (const [name, value] of [["project_url", url], ["cron_secret", secret]]) {
    const found = await db.query("select id from vault.secrets where name = $1", [name]);
    if (found.rows.length) await db.query("select vault.update_secret($1, $2)", [found.rows[0].id, value]);
    else await db.query("select vault.create_secret($1, $2)", [value, name]);
    console.log(`vault secret "${name}" saved`);
  }
  await db.end();
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
