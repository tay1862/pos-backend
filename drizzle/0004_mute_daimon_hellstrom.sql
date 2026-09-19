CREATE TYPE "public"."kitchen_job_item_status" AS ENUM('QUEUED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."print_job_status" AS ENUM('QUEUED', 'CLAIMED', 'ACKED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."print_job_type" AS ENUM('KITCHEN', 'RECEIPT');--> statement-breakpoint
CREATE TABLE "kitchen_job_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kitchen_job_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"status" "kitchen_job_item_status" DEFAULT 'QUEUED' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"dispatch_number" text NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"type" "print_job_type" NOT NULL,
	"status" "print_job_status" DEFAULT 'QUEUED' NOT NULL,
	"kitchen_job_id" uuid,
	"bill_id" uuid,
	"payload" jsonb NOT NULL,
	"copy" boolean DEFAULT false NOT NULL,
	"reason" text,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"failure_message" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kitchen_job_items" ADD CONSTRAINT "kitchen_job_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_job_items" ADD CONSTRAINT "kitchen_job_items_kitchen_job_id_kitchen_jobs_id_fk" FOREIGN KEY ("kitchen_job_id") REFERENCES "public"."kitchen_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_job_items" ADD CONSTRAINT "kitchen_job_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ADD CONSTRAINT "kitchen_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ADD CONSTRAINT "kitchen_jobs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ADD CONSTRAINT "kitchen_jobs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ADD CONSTRAINT "kitchen_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ADD CONSTRAINT "kitchen_jobs_station_id_kitchen_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ADD CONSTRAINT "kitchen_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_kitchen_job_id_kitchen_jobs_id_fk" FOREIGN KEY ("kitchen_job_id") REFERENCES "public"."kitchen_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kitchen_job_items_org_job_idx" ON "kitchen_job_items" USING btree ("organization_id","kitchen_job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_job_items_org_id_unique" ON "kitchen_job_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "kitchen_jobs_org_station_idx" ON "kitchen_jobs" USING btree ("organization_id","station_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_jobs_org_id_unique" ON "kitchen_jobs" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_stations_org_location_code_unique" ON "kitchen_stations" USING btree ("organization_id","location_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_stations_org_id_unique" ON "kitchen_stations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "print_jobs_org_status_idx" ON "print_jobs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "print_jobs_org_id_unique" ON "print_jobs" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_location_same_org_fk"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ADD CONSTRAINT "kitchen_jobs_location_same_org_fk"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ADD CONSTRAINT "kitchen_jobs_ticket_same_org_fk"
FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ADD CONSTRAINT "kitchen_jobs_order_same_org_fk"
FOREIGN KEY ("organization_id", "order_id") REFERENCES "orders" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ADD CONSTRAINT "kitchen_jobs_station_same_org_fk"
FOREIGN KEY ("organization_id", "station_id") REFERENCES "kitchen_stations" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "kitchen_job_items" ADD CONSTRAINT "kitchen_job_items_job_same_org_fk"
FOREIGN KEY ("organization_id", "kitchen_job_id") REFERENCES "kitchen_jobs" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "kitchen_job_items" ADD CONSTRAINT "kitchen_job_items_order_item_same_org_fk"
FOREIGN KEY ("organization_id", "order_item_id") REFERENCES "order_items" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_location_same_org_fk"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_kitchen_job_same_org_fk"
FOREIGN KEY ("organization_id", "kitchen_job_id") REFERENCES "kitchen_jobs" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_bill_same_org_fk"
FOREIGN KEY ("organization_id", "bill_id") REFERENCES "bills" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
CREATE TRIGGER kitchen_stations_set_updated_at
BEFORE UPDATE ON "kitchen_stations"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER kitchen_job_items_set_updated_at
BEFORE UPDATE ON "kitchen_job_items"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER print_jobs_set_updated_at
BEFORE UPDATE ON "print_jobs"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "kitchen_stations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kitchen_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "kitchen_job_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "print_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_kitchen_stations_policy ON "kitchen_stations"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_kitchen_jobs_policy ON "kitchen_jobs"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_kitchen_job_items_policy ON "kitchen_job_items"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_print_jobs_policy ON "print_jobs"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));
