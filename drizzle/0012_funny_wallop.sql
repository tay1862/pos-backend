CREATE TABLE "sync_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_snapshots" ADD CONSTRAINT "sync_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_snapshots" ADD CONSTRAINT "sync_snapshots_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_snapshots_org_sequence_idx" ON "sync_snapshots" USING btree ("organization_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_snapshots_org_id_unique" ON "sync_snapshots" USING btree ("organization_id","id");--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('sync.snapshot', 'Build sync snapshots for clients')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission_code")
SELECT r."organization_id", r."id", 'sync.snapshot'
FROM "roles" r
WHERE r."system" = true
  AND r."name" = 'Owner'
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "sync_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_sync_snapshots_policy ON "sync_snapshots" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));
