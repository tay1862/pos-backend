CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'REVOKE');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"actor_user_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_locations" (
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	CONSTRAINT "employee_locations_employee_id_location_id_pk" PRIMARY KEY("employee_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "employee_roles" (
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "employee_roles_employee_id_role_id_pk" PRIMARY KEY("employee_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"key" text NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING' NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" varchar(32) NOT NULL,
	"timezone" text DEFAULT 'Asia/Vientiane' NOT NULL,
	"default_payment_timing" varchar(16) DEFAULT 'POSTPAY' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(80) NOT NULL,
	"base_currency" varchar(3) DEFAULT 'LAK' NOT NULL,
	"timezone" text DEFAULT 'Asia/Vientiane' NOT NULL,
	"business_day_start" text DEFAULT '00:00' NOT NULL,
	"tax_enabled" boolean DEFAULT false NOT NULL,
	"service_charge_enabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"code" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"organization_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_code" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_code_pk" PRIMARY KEY("role_id","permission_code")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"ip_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"platform_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_locations" ADD CONSTRAINT "employee_locations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_permissions_code_fk" FOREIGN KEY ("permission_code") REFERENCES "public"."permissions"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_org_created_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "employees_org_idx" ON "employees" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employees_org_user_unique" ON "employees" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_unique" ON "idempotency_keys" USING btree ("organization_id","user_id","scope","key");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_unique" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_org_email_idx" ON "invitations" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_org_code_unique" ON "locations" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "locations_org_idx" ON "locations" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_org_user_unique" ON "organization_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_org_idx" ON "organization_memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_idx" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_unique" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_org_name_unique" ON "roles" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('organization.view', 'View organization settings'),
  ('organization.update', 'Update organization settings'),
  ('locations.manage', 'Manage locations'),
  ('employees.manage', 'Manage employees'),
  ('roles.manage', 'Manage roles and permissions'),
  ('audit.view', 'View audit logs'),
  ('tickets.create', 'Create tickets'),
  ('tickets.view', 'View tickets'),
  ('tickets.update', 'Update tickets'),
  ('tickets.merge', 'Merge tickets'),
  ('tickets.transfer_items', 'Transfer ticket items'),
  ('tickets.close', 'Close tickets'),
  ('tickets.cancel', 'Cancel tickets'),
  ('discounts.apply', 'Apply discounts'),
  ('refunds.create', 'Create refunds'),
  ('bills.void', 'Void bills'),
  ('kitchen.dispatch', 'Dispatch kitchen work'),
  ('kitchen.update', 'Update kitchen status'),
  ('print.reprint', 'Reprint receipts or kitchen jobs')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER organizations_set_updated_at
BEFORE UPDATE ON "organizations"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER organization_memberships_set_updated_at
BEFORE UPDATE ON "organization_memberships"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER locations_set_updated_at
BEFORE UPDATE ON "locations"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER employees_set_updated_at
BEFORE UPDATE ON "employees"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE TRIGGER roles_set_updated_at
BEFORE UPDATE ON "roles"
FOR EACH ROW EXECUTE FUNCTION set_updated_at();--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_last_organization_owner()
RETURNS trigger AS $$
DECLARE
  owner_count integer;
  target_organization_id uuid;
BEGIN
  target_organization_id := COALESCE(OLD.organization_id, NEW.organization_id);

  IF TG_OP = 'DELETE' AND OLD.is_owner THEN
    SELECT count(*) INTO owner_count
    FROM organization_memberships
    WHERE organization_id = target_organization_id
      AND is_owner = true
      AND status = 'ACTIVE'
      AND id <> OLD.id;

    IF owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last active organization owner';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_owner AND (NEW.is_owner = false OR NEW.status <> 'ACTIVE') THEN
    SELECT count(*) INTO owner_count
    FROM organization_memberships
    WHERE organization_id = target_organization_id
      AND is_owner = true
      AND status = 'ACTIVE'
      AND id <> OLD.id;

    IF owner_count = 0 THEN
      RAISE EXCEPTION 'Cannot disable the last active organization owner';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER organization_memberships_protect_last_owner_update
BEFORE UPDATE ON "organization_memberships"
FOR EACH ROW EXECUTE FUNCTION protect_last_organization_owner();--> statement-breakpoint
CREATE TRIGGER organization_memberships_protect_last_owner_delete
BEFORE DELETE ON "organization_memberships"
FOR EACH ROW EXECUTE FUNCTION protect_last_organization_owner();--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_organizations_policy ON "organizations"
USING (id::text = current_setting('app.current_organization_id', true) OR current_setting('app.platform_admin', true) = 'true')
WITH CHECK (id::text = current_setting('app.current_organization_id', true) OR current_setting('app.platform_admin', true) = 'true');--> statement-breakpoint
CREATE POLICY tenant_organization_memberships_policy ON "organization_memberships"
USING (organization_id::text = current_setting('app.current_organization_id', true) OR current_setting('app.platform_admin', true) = 'true')
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true) OR current_setting('app.platform_admin', true) = 'true');--> statement-breakpoint
CREATE POLICY tenant_locations_policy ON "locations"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_employees_policy ON "employees"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_employee_locations_policy ON "employee_locations"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_roles_policy ON "roles"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_role_permissions_policy ON "role_permissions"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_employee_roles_policy ON "employee_roles"
USING (organization_id::text = current_setting('app.current_organization_id', true))
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true));--> statement-breakpoint
CREATE POLICY tenant_invitations_policy ON "invitations"
USING (organization_id::text = current_setting('app.current_organization_id', true) OR current_setting('app.platform_admin', true) = 'true')
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true) OR current_setting('app.platform_admin', true) = 'true');--> statement-breakpoint
CREATE POLICY tenant_audit_logs_policy ON "audit_logs"
USING (organization_id::text = current_setting('app.current_organization_id', true) OR organization_id IS NULL OR current_setting('app.platform_admin', true) = 'true')
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true) OR organization_id IS NULL OR current_setting('app.platform_admin', true) = 'true');--> statement-breakpoint
CREATE POLICY tenant_idempotency_keys_policy ON "idempotency_keys"
USING (organization_id::text = current_setting('app.current_organization_id', true) OR organization_id IS NULL)
WITH CHECK (organization_id::text = current_setting('app.current_organization_id', true) OR organization_id IS NULL);
