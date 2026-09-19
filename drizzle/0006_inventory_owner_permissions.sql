INSERT INTO "permissions" ("code", "description") VALUES
  ('inventory.view', 'View inventory warehouses, balances, counts, transfers, and recipes'),
  ('inventory.manage', 'Manage inventory warehouses, stock ledger adjustments, counts, and transfers'),
  ('purchasing.manage', 'Manage purchase orders and purchase receipts'),
  ('recipes.manage', 'Manage recipes and bills of materials')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission_code")
SELECT r."organization_id", r."id", p."code"
FROM "roles" r
CROSS JOIN (
  VALUES
    ('inventory.view'),
    ('inventory.manage'),
    ('purchasing.manage'),
    ('recipes.manage')
) AS p("code")
WHERE r."system" = true
  AND r."name" = 'Owner'
ON CONFLICT DO NOTHING;
