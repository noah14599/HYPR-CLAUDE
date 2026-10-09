// Shared database connection, using the private settings in ../.env.
const { Client } = require("pg");

function connect() {
  const { SUPABASE_DB_HOST, SUPABASE_DB_PASSWORD } = process.env;
  if (!SUPABASE_DB_HOST || !SUPABASE_DB_PASSWORD) throw new Error("SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD must be set in .env");
  return new Client({
    host: SUPABASE_DB_HOST, port: 5432, user: "postgres", database: "postgres",
    password: SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: false },
  });
}

module.exports = { connect };
