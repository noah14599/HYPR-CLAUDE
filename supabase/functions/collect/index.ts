// Scheduled news collector. Called by pg_cron (see db/005_schedule.sql) as POST /functions/v1/collect?source=…
// Only callers with the private x-cron-secret header may run it.
import { run } from "../_shared/runner.mjs";

Deno.serve(async req => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("forbidden", { status: 403 });
  const source = new URL(req.url).searchParams.get("source") || "";
  try {
    const result = await run(source);
    return Response.json(result);
  } catch (e) {
    return Response.json({ source, error: (e as Error).message }, { status: 500 });
  }
});
