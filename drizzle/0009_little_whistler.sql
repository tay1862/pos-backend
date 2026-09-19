CREATE TYPE "public"."device_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"code" varchar(64) NOT NULL,
	"name" text NOT NULL,
	"status" "device_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_client_states" (
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"last_sequence" bigint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid,
	CONSTRAINT "sync_client_states_organization_id_device_id_pk" PRIMARY KEY("organization_id","device_id")
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_client_states" ADD CONSTRAINT "sync_client_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_client_states" ADD CONSTRAINT "sync_client_states_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_client_states" ADD CONSTRAINT "sync_client_states_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_org_code_unique" ON "devices" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "devices_org_location_idx" ON "devices" USING btree ("organization_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_org_id_unique" ON "devices" USING btree ("organization_id","id");--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('devices.view', 'View registered POS devices'),
  ('devices.manage', 'Register, update, and revoke POS devices')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission_code")
SELECT r."organization_id", r."id", p."code"
FROM "roles" r
CROSS JOIN (
  VALUES
    ('devices.view'),
    ('devices.manage')
) AS p("code")
WHERE r."system" = true
  AND r."name" = 'Owner'
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_location_same_org_fk"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations" ("organization_id", "id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "sync_client_states" ADD CONSTRAINT "sync_client_states_device_same_org_fk"
FOREIGN KEY ("organization_id", "device_id") REFERENCES "devices" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
CREATE TRIGGER devices_set_updated_at
BEFORE UPDATE ON "devices"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sync_client_states" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_devices_policy ON "devices" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_sync_client_states_policy ON "sync_client_states" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));
