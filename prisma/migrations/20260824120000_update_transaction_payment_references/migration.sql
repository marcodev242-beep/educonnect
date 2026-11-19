-- Preserve the old external reference while introducing explicit payment identifiers.
ALTER TABLE "transactions"
  RENAME COLUMN "reference_momo" TO "ref_externe";

ALTER TABLE "transactions"
  ADD COLUMN "ref_interne" TEXT,
  ADD COLUMN "ref_operateur" TEXT,
  ADD COLUMN "msisdn" TEXT;

UPDATE "transactions"
SET "ref_interne" = 'LEGACY-' || "id_transaction"::text
WHERE "ref_interne" IS NULL;

ALTER TABLE "transactions"
  ALTER COLUMN "ref_interne" SET NOT NULL,
  ALTER COLUMN "statut_paiement" SET DEFAULT 'PENDING';

ALTER INDEX "transactions_reference_momo_key"
  RENAME TO "transactions_ref_externe_key";

CREATE UNIQUE INDEX "transactions_ref_interne_key" ON "transactions"("ref_interne");
