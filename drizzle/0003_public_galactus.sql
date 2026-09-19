CREATE TYPE "public"."bill_status" AS ENUM('DRAFT', 'ISSUED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('DRAFT', 'OPEN', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'QR', 'TRANSFER', 'CARD', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_timing" AS ENUM('PREPAY', 'POSTPAY');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."sale_context" AS ENUM('DINE_IN', 'TAKEAWAY', 'RETAIL', 'WHOLESALE');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('OPEN', 'CLOSED', 'CANCELLED', 'MERGED');--> statement-breakpoint
CREATE TABLE "bill_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit_price" numeric(20, 6) NOT NULL,
	"subtotal" numeric(20, 6) NOT NULL,
	"tax_total" numeric(20, 6) NOT NULL,
	"total" numeric(20, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" "bill_status" DEFAULT 'DRAFT' NOT NULL,
	"currency" varchar(3) NOT NULL,
	"subtotal" numeric(20, 6) DEFAULT '0' NOT NULL,
	"tax_total" numeric(20, 6) DEFAULT '0' NOT NULL,
	"total" numeric(20, 6) DEFAULT '0' NOT NULL,
	"issued_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit_price" numeric(20, 6) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"product_name_snapshot" text NOT NULL,
	"variant_name_snapshot" text NOT NULL,
	"tax_rate_id" uuid,
	"tax_rate_snapshot" numeric(9, 6) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"context" "sale_context" DEFAULT 'DINE_IN' NOT NULL,
	"status" "order_status" DEFAULT 'OPEN' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reference" text,
	"confirmed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_status" DEFAULT 'COMPLETED' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_counters" (
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"business_date" date NOT NULL,
	"next_sequence" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ticket_counters_organization_id_location_id_business_date_pk" PRIMARY KEY("organization_id","location_id","business_date")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"number" text NOT NULL,
	"label" text,
	"customer_name" text,
	"assigned_employee_id" uuid,
	"status" "ticket_status" DEFAULT 'OPEN' NOT NULL,
	"payment_timing" "payment_timing" DEFAULT 'POSTPAY' NOT NULL,
	"business_date" date NOT NULL,
	"merged_into_ticket_id" uuid,
	"closed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_counters" ADD CONSTRAINT "ticket_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_counters" ADD CONSTRAINT "ticket_counters_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_employee_id_employees_id_fk" FOREIGN KEY ("assigned_employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_items_org_bill_idx" ON "bill_items" USING btree ("organization_id","bill_id");--> statement-breakpoint
CREATE INDEX "bills_org_ticket_idx" ON "bills" USING btree ("organization_id","ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_org_ticket_number_unique" ON "bills" USING btree ("organization_id","ticket_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_org_id_unique" ON "bills" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "order_items_org_order_idx" ON "order_items" USING btree ("organization_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_org_id_unique" ON "order_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_org_ticket_unique" ON "orders" USING btree ("organization_id","ticket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_org_id_unique" ON "orders" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "payments_org_bill_idx" ON "payments" USING btree ("organization_id","bill_id");--> statement-breakpoint
CREATE INDEX "refunds_org_payment_idx" ON "refunds" USING btree ("organization_id","payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_org_location_number_unique" ON "tickets" USING btree ("organization_id","location_id","number");--> statement-breakpoint
CREATE INDEX "tickets_org_status_idx" ON "tickets" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_org_id_unique" ON "tickets" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_org_id_unique" ON "payments" USING btree ("organization_id","id");--> statement-breakpoint
ALTER TABLE "ticket_counters" ADD CONSTRAINT "ticket_counters_location_same_org_fk"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_location_same_org_fk"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_employee_same_org_fk"
FOREIGN KEY ("organization_id", "assigned_employee_id") REFERENCES "employees" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_merged_into_same_org_fk"
FOREIGN KEY ("organization_id", "merged_into_ticket_id") REFERENCES "tickets" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ticket_same_org_fk"
FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_same_org_fk"
FOREIGN KEY ("organization_id", "order_id") REFERENCES "orders" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_same_org_fk"
FOREIGN KEY ("organization_id", "product_id") REFERENCES "products" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_same_org_fk"
FOREIGN KEY ("organization_id", "variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tax_rate_same_org_fk"
FOREIGN KEY ("organization_id", "tax_rate_id") REFERENCES "tax_rates" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_order_same_org_fk"
FOREIGN KEY ("organization_id", "order_id") REFERENCES "orders" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_ticket_same_org_fk"
FOREIGN KEY ("organization_id", "ticket_id") REFERENCES "tickets" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_bill_same_org_fk"
FOREIGN KEY ("organization_id", "bill_id") REFERENCES "bills" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "bill_items" ADD CONSTRAINT "bill_items_order_item_same_org_fk"
FOREIGN KEY ("organization_id", "order_item_id") REFERENCES "order_items" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_same_org_fk"
FOREIGN KEY ("organization_id", "bill_id") REFERENCES "bills" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_same_org_fk"
FOREIGN KEY ("organization_id", "payment_id") REFERENCES "payments" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
CREATE TRIGGER tickets_set_updated_at
BEFORE UPDATE ON "tickets"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON "orders"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER order_items_set_updated_at
BEFORE UPDATE ON "order_items"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER bills_set_updated_at
BEFORE UPDATE ON "bills"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "ticket_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tickets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bill_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_ticket_counters_policy ON "ticket_counters"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_tickets_policy ON "tickets"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_orders_policy ON "orders"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_order_items_policy ON "order_items"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_bills_policy ON "bills"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_bill_items_policy ON "bill_items"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_payments_policy ON "payments"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_refunds_policy ON "refunds"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));
