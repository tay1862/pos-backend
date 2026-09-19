import { expect, test } from "bun:test";
import postgres from "postgres";

const url = process.env.INTEGRATION_DATABASE_URL;

if (!url) {
  test.skip("PostgreSQL integration checks run when INTEGRATION_DATABASE_URL is configured", () => {});
} else {
  test("runtime role has RLS enabled and tenant join constraints exist", async () => {
    const client = postgres(url);
    try {
      const [rls] = await client`select relrowsecurity as enabled, relforcerowsecurity as forced from pg_class where oid = 'public.organizations'::regclass`;
      expect(rls?.enabled).toBe(true);
      const [role] = await client`select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
      expect(role?.rolsuper || role?.rolbypassrls).toBe(false);
      const constraints = await client`select conname from pg_constraint where conname in ('employee_locations_org_employee_fk', 'employee_roles_org_role_fk')`;
      expect(constraints.length).toBe(2);
    } finally {
      await client.end({ timeout: 1 });
    }
  });
}
