CREATE TYPE "public"."product_type" AS ENUM('RETAIL', 'SERVICE', 'PREPARED', 'RAW_MATERIAL');--> statement-breakpoint
CREATE TABLE "catalog_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"price_list_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"tax_rate_id" uuid,
	"price" numeric(20, 6) NOT NULL,
	"service_charge_eligible" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" varchar(3) DEFAULT 'LAK' NOT NULL,
	"default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"sku" varchar(80),
	"barcode" varchar(80),
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"type" "product_type" DEFAULT 'RETAIL' NOT NULL,
	"track_inventory" boolean DEFAULT false NOT NULL,
	"taxable" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tax_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"rate" numeric(9, 6) NOT NULL,
	"included_in_price" boolean DEFAULT false NOT NULL,
	"default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" text NOT NULL,
	"symbol" varchar(16) NOT NULL,
	"precision" integer DEFAULT 0 NOT NULL,
	"quantity_step" numeric(20, 6) DEFAULT '1' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_tax_rate_id_tax_rates_id_fk" FOREIGN KEY ("tax_rate_id") REFERENCES "public"."tax_rates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_catalog_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."catalog_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_categories_org_name_unique" ON "catalog_categories" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "catalog_categories_org_idx" ON "catalog_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_categories_org_id_unique" ON "catalog_categories" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_list_items_list_variant_unique" ON "price_list_items" USING btree ("organization_id","price_list_id","variant_id");--> statement-breakpoint
CREATE INDEX "price_list_items_org_variant_idx" ON "price_list_items" USING btree ("organization_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_org_name_unique" ON "price_lists" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "price_lists_org_id_unique" ON "price_lists" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_sku_unique" ON "product_variants" USING btree ("organization_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_barcode_unique" ON "product_variants" USING btree ("organization_id","barcode");--> statement-breakpoint
CREATE INDEX "product_variants_org_product_idx" ON "product_variants" USING btree ("organization_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_org_id_unique" ON "product_variants" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "products_org_name_idx" ON "products" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "products_org_id_unique" ON "products" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_org_name_unique" ON "tax_rates" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tax_rates_org_id_unique" ON "tax_rates" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_org_code_unique" ON "units" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "units_org_id_unique" ON "units" USING btree ("organization_id","id");--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('catalog.view', 'View catalog, products, units, tax rates, and prices'),
  ('catalog.manage', 'Manage catalog categories, products, variants, and units'),
  ('pricing.manage', 'Manage price lists and prices'),
  ('taxes.manage', 'Manage tax rates')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
ALTER TABLE "catalog_categories" ADD CONSTRAINT "catalog_categories_parent_same_org_fk"
FOREIGN KEY ("organization_id", "parent_id") REFERENCES "catalog_categories" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_same_org_fk"
FOREIGN KEY ("organization_id", "category_id") REFERENCES "catalog_categories" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_same_org_fk"
FOREIGN KEY ("organization_id", "product_id") REFERENCES "products" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_unit_same_org_fk"
FOREIGN KEY ("organization_id", "unit_id") REFERENCES "units" ("organization_id", "id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_same_org_fk"
FOREIGN KEY ("organization_id", "price_list_id") REFERENCES "price_lists" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_variant_same_org_fk"
FOREIGN KEY ("organization_id", "variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_tax_rate_same_org_fk"
FOREIGN KEY ("organization_id", "tax_rate_id") REFERENCES "tax_rates" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
CREATE TRIGGER catalog_categories_set_updated_at
BEFORE UPDATE ON "catalog_categories"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER units_set_updated_at
BEFORE UPDATE ON "units"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON "products"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER product_variants_set_updated_at
BEFORE UPDATE ON "product_variants"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER tax_rates_set_updated_at
BEFORE UPDATE ON "tax_rates"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER price_lists_set_updated_at
BEFORE UPDATE ON "price_lists"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER price_list_items_set_updated_at
BEFORE UPDATE ON "price_list_items"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "catalog_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "units" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tax_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "price_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "price_list_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_catalog_categories_policy ON "catalog_categories"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_units_policy ON "units"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_products_policy ON "products"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_product_variants_policy ON "product_variants"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_tax_rates_policy ON "tax_rates"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_price_lists_policy ON "price_lists"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_price_list_items_policy ON "price_list_items"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));
