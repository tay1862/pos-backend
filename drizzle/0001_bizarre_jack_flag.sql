CREATE UNIQUE INDEX "employees_org_id_unique" ON "employees" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_org_id_unique" ON "locations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_id_unique" ON "roles" USING btree ("organization_id","id");