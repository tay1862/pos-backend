CREATE TYPE "public"."sync_command_status" AS ENUM('RECEIVED', 'APPLIED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "sync_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"client_command_id" uuid NOT NULL,
	"command_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid,
	"base_sequence" bigint DEFAULT 0 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "sync_command_status" DEFAULT 'RECEIVED' NOT NULL,
	"error_code" text,
	"error_message" text,
	"received_by_user_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sync_commands" ADD CONSTRAINT "sync_commands_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_commands" ADD CONSTRAINT "sync_commands_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_commands" ADD CONSTRAINT "sync_commands_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sync_commands_device_command_unique" ON "sync_commands" USING btree ("organization_id","device_id","client_command_id");--> statement-breakpoint
CREATE INDEX "sync_commands_org_status_idx" ON "sync_commands" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "sync_commands_org_device_idx" ON "sync_commands" USING btree ("organization_id","device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_commands_org_id_unique" ON "sync_commands" USING btree ("organization_id","id");--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('sync.write', 'Submit device offline sync commands')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission_code")
SELECT r."organization_id", r."id", 'sync.write'
FROM "roles" r
WHERE r."system" = true
  AND r."name" = 'Owner'
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "sync_commands" ADD CONSTRAINT "sync_commands_device_same_org_fk"
FOREIGN KEY ("organization_id", "device_id") REFERENCES "devices" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "sync_commands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_sync_commands_policy ON "sync_commands" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));
