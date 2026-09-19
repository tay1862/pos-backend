CREATE TYPE "public"."quotation_status" AS ENUM('DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."wholesale_invoice_status" AS ENUM('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOIDED', 'OVERDUE');--> statement-breakpoint
CREATE TABLE "customer_price_lists" (
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_price_lists_organization_id_customer_id_price_list_id_pk" PRIMARY KEY("organization_id","customer_id","price_list_id")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"tax_id" text,
	"billing_address" text,
	"payment_terms_days" integer DEFAULT 0 NOT NULL,
	"credit_limit" numeric(20, 6) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit_price" numeric(20, 6) NOT NULL,
	"line_total" numeric(20, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quote_number" varchar(40) NOT NULL,
	"status" "quotation_status" DEFAULT 'DRAFT' NOT NULL,
	"currency" varchar(3) DEFAULT 'LAK' NOT NULL,
	"expires_on" date,
	"subtotal" numeric(20, 6) DEFAULT '0' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"sent_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivable_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"method" "payment_method" NOT NULL,
	"reference" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wholesale_invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit_price" numeric(20, 6) NOT NULL,
	"line_total" numeric(20, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wholesale_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quotation_id" uuid,
	"invoice_number" varchar(40) NOT NULL,
	"status" "wholesale_invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"currency" varchar(3) DEFAULT 'LAK' NOT NULL,
	"issued_on" date,
	"due_on" date,
	"subtotal" numeric(20, 6) DEFAULT '0' NOT NULL,
	"total" numeric(20, 6) DEFAULT '0' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_price_lists" ADD CONSTRAINT "customer_price_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_price_lists" ADD CONSTRAINT "customer_price_lists_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_price_lists" ADD CONSTRAINT "customer_price_lists_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_invoice_id_wholesale_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."wholesale_invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoice_items" ADD CONSTRAINT "wholesale_invoice_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoice_items" ADD CONSTRAINT "wholesale_invoice_items_invoice_id_wholesale_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."wholesale_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoice_items" ADD CONSTRAINT "wholesale_invoice_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoices" ADD CONSTRAINT "wholesale_invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoices" ADD CONSTRAINT "wholesale_invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoices" ADD CONSTRAINT "wholesale_invoices_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoices" ADD CONSTRAINT "wholesale_invoices_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoices" ADD CONSTRAINT "wholesale_invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_price_lists_customer_idx" ON "customer_price_lists" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_code_unique" ON "customers" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "customers_org_name_idx" ON "customers" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_org_id_unique" ON "customers" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "quotation_items_org_quotation_idx" ON "quotation_items" USING btree ("organization_id","quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_items_org_id_unique" ON "quotation_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_org_number_unique" ON "quotations" USING btree ("organization_id","quote_number");--> statement-breakpoint
CREATE INDEX "quotations_org_customer_idx" ON "quotations" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotations_org_id_unique" ON "quotations" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "receivable_payments_org_invoice_idx" ON "receivable_payments" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "receivable_payments_org_id_unique" ON "receivable_payments" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "wholesale_invoice_items_org_invoice_idx" ON "wholesale_invoice_items" USING btree ("organization_id","invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wholesale_invoice_items_org_id_unique" ON "wholesale_invoice_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "wholesale_invoices_org_number_unique" ON "wholesale_invoices" USING btree ("organization_id","invoice_number");--> statement-breakpoint
CREATE INDEX "wholesale_invoices_org_customer_idx" ON "wholesale_invoices" USING btree ("organization_id","customer_id");--> statement-breakpoint
CREATE INDEX "wholesale_invoices_org_status_idx" ON "wholesale_invoices" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "wholesale_invoices_org_id_unique" ON "wholesale_invoices" USING btree ("organization_id","id");--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('wholesale.view', 'View wholesale customers, quotations, invoices, and receivables'),
  ('wholesale.manage', 'Manage wholesale customers, quotations, invoices, and customer pricing'),
  ('receivables.manage', 'Record and manage receivable payments')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission_code")
SELECT r."organization_id", r."id", p."code"
FROM "roles" r
CROSS JOIN (
  VALUES
    ('wholesale.view'),
    ('wholesale.manage'),
    ('receivables.manage')
) AS p("code")
WHERE r."system" = true
  AND r."name" = 'Owner'
ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "customer_price_lists" ADD CONSTRAINT "customer_price_lists_customer_same_org_fk"
FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "customer_price_lists" ADD CONSTRAINT "customer_price_lists_price_list_same_org_fk"
FOREIGN KEY ("organization_id", "price_list_id") REFERENCES "price_lists" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_same_org_fk"
FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_location_same_org_fk"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_same_org_fk"
FOREIGN KEY ("organization_id", "quotation_id") REFERENCES "quotations" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_variant_same_org_fk"
FOREIGN KEY ("organization_id", "variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoices" ADD CONSTRAINT "wholesale_invoices_customer_same_org_fk"
FOREIGN KEY ("organization_id", "customer_id") REFERENCES "customers" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoices" ADD CONSTRAINT "wholesale_invoices_location_same_org_fk"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "wholesale_invoices" ADD CONSTRAINT "wholesale_invoices_quotation_same_org_fk"
FOREIGN KEY ("organization_id", "quotation_id") REFERENCES "quotations" ("organization_id", "id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "wholesale_invoice_items" ADD CONSTRAINT "wholesale_invoice_items_invoice_same_org_fk"
FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "wholesale_invoices" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "wholesale_invoice_items" ADD CONSTRAINT "wholesale_invoice_items_variant_same_org_fk"
FOREIGN KEY ("organization_id", "variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "receivable_payments" ADD CONSTRAINT "receivable_payments_invoice_same_org_fk"
FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "wholesale_invoices" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
CREATE TRIGGER customers_set_updated_at
BEFORE UPDATE ON "customers"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER quotations_set_updated_at
BEFORE UPDATE ON "quotations"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER wholesale_invoices_set_updated_at
BEFORE UPDATE ON "wholesale_invoices"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_price_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "quotation_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wholesale_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "wholesale_invoice_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receivable_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_customers_policy ON "customers" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_customer_price_lists_policy ON "customer_price_lists" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_quotations_policy ON "quotations" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_quotation_items_policy ON "quotation_items" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_wholesale_invoices_policy ON "wholesale_invoices" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_wholesale_invoice_items_policy ON "wholesale_invoice_items" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_receivable_payments_policy ON "receivable_payments" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));
