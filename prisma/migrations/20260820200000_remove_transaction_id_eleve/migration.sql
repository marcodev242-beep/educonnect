-- The payer is now represented by id_utilisateur or id_etablissement.
ALTER TABLE "transactions"
  DROP CONSTRAINT "transactions_id_eleve_fkey";

ALTER TABLE "transactions"
  DROP COLUMN "id_eleve";
