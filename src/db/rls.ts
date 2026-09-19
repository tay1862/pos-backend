import { sql, type SQL } from "drizzle-orm";

type RlsExecutor = {
  execute(query: SQL): Promise<unknown>;
};

export async function setRlsContext(
  db: RlsExecutor,
  input: { organizationId?: string; platformAdmin?: boolean; local?: boolean }
) {
  await db.execute(sql`
    select
      set_config('app.current_organization_id', ${input.organizationId ?? ""}, ${input.local ?? false}),
      set_config('app.platform_admin', ${input.platformAdmin ? "true" : "false"}, ${input.local ?? false})
  `);
}
