CREATE TABLE "sync_events" (
	"sequence" bigserial PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"action" "audit_action" NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_events" ADD CONSTRAINT "sync_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_events_org_sequence_idx" ON "sync_events" USING btree ("organization_id","sequence");--> statement-breakpoint
CREATE INDEX "sync_events_org_entity_idx" ON "sync_events" USING btree ("organization_id","entity_type","entity_id");--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('sync.read', 'Read tenant sync events for offline and realtime clients')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission_code")
SELECT r."organization_id", r."id", 'sync.read'
FROM "roles" r
WHERE r."system" = true
  AND r."name" = 'Owner'
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "sync_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_sync_events_policy ON "sync_events" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));
