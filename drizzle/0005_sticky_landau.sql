CREATE TYPE "public"."purchase_order_status" AS ENUM('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."recipe_status" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."stock_count_status" AS ENUM('DRAFT', 'POSTED', 'VOIDED');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('ADJUSTMENT', 'COUNT', 'TRANSFER_OUT', 'TRANSFER_IN', 'PURCHASE_RECEIPT', 'SALE_HANDOVER', 'RECIPE_CONSUME', 'WASTE', 'RETURN');--> statement-breakpoint
CREATE TYPE "public"."stock_transfer_status" AS ENUM('DRAFT', 'POSTED', 'VOIDED');--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit_cost" numeric(20, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"supplier_name" text NOT NULL,
	"status" "purchase_order_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"ordered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purchase_receipt_id" uuid NOT NULL,
	"purchase_order_item_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"unit_cost" numeric(20, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"input_variant_id" uuid NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"output_variant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"output_quantity" numeric(20, 6) DEFAULT '1' NOT NULL,
	"status" "recipe_status" DEFAULT 'ACTIVE' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_count_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stock_count_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"counted_quantity" numeric(20, 6) NOT NULL,
	"expected_quantity_snapshot" numeric(20, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"status" "stock_count_status" DEFAULT 'DRAFT' NOT NULL,
	"counted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity_delta" numeric(20, 6) NOT NULL,
	"unit_cost" numeric(20, 6),
	"reference_type" text,
	"reference_id" uuid,
	"reason" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stock_transfer_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"quantity" numeric(20, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"from_warehouse_id" uuid NOT NULL,
	"to_warehouse_id" uuid NOT NULL,
	"status" "stock_transfer_status" DEFAULT 'DRAFT' NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
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
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_purchase_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("purchase_receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_purchase_order_item_id_purchase_order_items_id_fk" FOREIGN KEY ("purchase_order_item_id") REFERENCES "public"."purchase_order_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_input_variant_id_product_variants_id_fk" FOREIGN KEY ("input_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_output_variant_id_product_variants_id_fk" FOREIGN KEY ("output_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stock_count_id_stock_counts_id_fk" FOREIGN KEY ("stock_count_id") REFERENCES "public"."stock_counts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_stock_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("stock_transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_items_purchase_variant_unique" ON "purchase_order_items" USING btree ("organization_id","purchase_order_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_items_org_id_unique" ON "purchase_order_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "purchase_orders_org_status_idx" ON "purchase_orders" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_orders_org_id_unique" ON "purchase_orders" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "purchase_receipt_items_org_receipt_idx" ON "purchase_receipt_items" USING btree ("organization_id","purchase_receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipt_items_org_id_unique" ON "purchase_receipt_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "purchase_receipts_org_purchase_idx" ON "purchase_receipts" USING btree ("organization_id","purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipts_org_id_unique" ON "purchase_receipts" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_items_recipe_input_unique" ON "recipe_items" USING btree ("organization_id","recipe_id","input_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_items_org_id_unique" ON "recipe_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_org_output_unique" ON "recipes" USING btree ("organization_id","output_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipes_org_id_unique" ON "recipes" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_items_count_variant_unique" ON "stock_count_items" USING btree ("organization_id","stock_count_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_count_items_org_id_unique" ON "stock_count_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "stock_counts_org_warehouse_idx" ON "stock_counts" USING btree ("organization_id","warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_counts_org_id_unique" ON "stock_counts" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "stock_movements_org_warehouse_variant_idx" ON "stock_movements" USING btree ("organization_id","warehouse_id","variant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_org_reference_idx" ON "stock_movements" USING btree ("organization_id","reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfer_items_transfer_variant_unique" ON "stock_transfer_items" USING btree ("organization_id","stock_transfer_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfer_items_org_id_unique" ON "stock_transfer_items" USING btree ("organization_id","id");--> statement-breakpoint
CREATE INDEX "stock_transfers_org_status_idx" ON "stock_transfers" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_transfers_org_id_unique" ON "stock_transfers" USING btree ("organization_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_org_location_code_unique" ON "warehouses" USING btree ("organization_id","location_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_org_id_unique" ON "warehouses" USING btree ("organization_id","id");--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('inventory.view', 'View inventory warehouses, balances, counts, transfers, and recipes'),
  ('inventory.manage', 'Manage inventory warehouses, stock ledger adjustments, counts, and transfers'),
  ('purchasing.manage', 'Manage purchase orders and purchase receipts'),
  ('recipes.manage', 'Manage recipes and bills of materials')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_location_same_org_fk"
FOREIGN KEY ("organization_id", "location_id") REFERENCES "locations" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_same_org_fk"
FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_same_org_fk"
FOREIGN KEY ("organization_id", "variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_same_org_fk"
FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_count_same_org_fk"
FOREIGN KEY ("organization_id", "stock_count_id") REFERENCES "stock_counts" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_variant_same_org_fk"
FOREIGN KEY ("organization_id", "variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_warehouse_same_org_fk"
FOREIGN KEY ("organization_id", "from_warehouse_id") REFERENCES "warehouses" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_warehouse_same_org_fk"
FOREIGN KEY ("organization_id", "to_warehouse_id") REFERENCES "warehouses" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_same_org_fk"
FOREIGN KEY ("organization_id", "stock_transfer_id") REFERENCES "stock_transfers" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_variant_same_org_fk"
FOREIGN KEY ("organization_id", "variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_same_org_fk"
FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_same_org_fk"
FOREIGN KEY ("organization_id", "purchase_order_id") REFERENCES "purchase_orders" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_variant_same_org_fk"
FOREIGN KEY ("organization_id", "variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_same_org_fk"
FOREIGN KEY ("organization_id", "purchase_order_id") REFERENCES "purchase_orders" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_warehouse_same_org_fk"
FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_receipt_same_org_fk"
FOREIGN KEY ("organization_id", "purchase_receipt_id") REFERENCES "purchase_receipts" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_purchase_order_item_same_org_fk"
FOREIGN KEY ("organization_id", "purchase_order_item_id") REFERENCES "purchase_order_items" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ADD CONSTRAINT "purchase_receipt_items_variant_same_org_fk"
FOREIGN KEY ("organization_id", "variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_output_variant_same_org_fk"
FOREIGN KEY ("organization_id", "output_variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_recipe_same_org_fk"
FOREIGN KEY ("organization_id", "recipe_id") REFERENCES "recipes" ("organization_id", "id") ON DELETE cascade;--> statement-breakpoint
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_input_variant_same_org_fk"
FOREIGN KEY ("organization_id", "input_variant_id") REFERENCES "product_variants" ("organization_id", "id") ON DELETE no action;--> statement-breakpoint
CREATE TRIGGER warehouses_set_updated_at
BEFORE UPDATE ON "warehouses"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER stock_counts_set_updated_at
BEFORE UPDATE ON "stock_counts"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER stock_transfers_set_updated_at
BEFORE UPDATE ON "stock_transfers"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER purchase_orders_set_updated_at
BEFORE UPDATE ON "purchase_orders"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER recipes_set_updated_at
BEFORE UPDATE ON "recipes"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_counts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_count_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stock_transfer_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_receipt_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recipe_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_warehouses_policy ON "warehouses" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_stock_movements_policy ON "stock_movements" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_stock_counts_policy ON "stock_counts" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_stock_count_items_policy ON "stock_count_items" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_stock_transfers_policy ON "stock_transfers" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_stock_transfer_items_policy ON "stock_transfer_items" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_purchase_orders_policy ON "purchase_orders" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_purchase_order_items_policy ON "purchase_order_items" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_purchase_receipts_policy ON "purchase_receipts" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_purchase_receipt_items_policy ON "purchase_receipt_items" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_recipes_policy ON "recipes" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_recipe_items_policy ON "recipe_items" USING (organization_id::text = current_setting('app.current_organization_id', true)) WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));
