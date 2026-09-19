ALTER TABLE "sync_commands" ADD COLUMN "result_entity_type" text;--> statement-breakpoint
ALTER TABLE "sync_commands" ADD COLUMN "result_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "sync_commands" ADD COLUMN "result_sequence" bigint;--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('sync.process', 'Process queued sync commands')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission_code")
SELECT r."organization_id", r."id", 'sync.process'
FROM "roles" r
WHERE r."system" = true
  AND r."name" = 'Owner'
ON CONFLICT DO NOTHING;
