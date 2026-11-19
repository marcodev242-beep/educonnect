-- Add stable payer categories to Mobile Money transactions.
ALTER TABLE "transactions"
  ADD COLUMN "type_utilisateur" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "id_utilisateur" UUID,
  ADD COLUMN "id_etablissement" UUID;

ALTER TABLE "transactions"
  ALTER COLUMN "id_eleve" DROP NOT NULL;

UPDATE "transactions" AS t
SET "type_utilisateur" = CASE
  WHEN lower(u."role") LIKE 'enseign%' THEN 2
  ELSE 1
END,
"id_utilisateur" = t."id_eleve"
FROM "utilisateurs" u
WHERE t."id_eleve" = u."id_utilisateur"
  AND t."type_utilisateur" IS NULL;

UPDATE "transactions"
SET "type_utilisateur" = 1
WHERE "type_utilisateur" IS NULL;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_type_utilisateur_check"
  CHECK ("type_utilisateur" IN (1, 2, 3));

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_id_utilisateur_fkey"
  FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateurs"("id_utilisateur") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_id_etablissement_fkey"
  FOREIGN KEY ("id_etablissement") REFERENCES "etablissements"("id_etablissement") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "transactions_type_utilisateur_idx"
  ON "transactions"("type_utilisateur");
