CREATE TABLE IF NOT EXISTS "paiements" (
    "id_paiement" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type_utilisateur" TEXT NOT NULL,
    "date_paiement" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_document" UUID NOT NULL,
    "id_utilisateur" UUID NOT NULL,
    "numero_achat" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "montant" DECIMAL(10,2) NOT NULL DEFAULT 0.00,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id_paiement")
);

CREATE UNIQUE INDEX IF NOT EXISTS "paiements_reference_key" ON "paiements"("reference");

ALTER TABLE "paiements" ADD CONSTRAINT "paiements_id_document_fkey"
FOREIGN KEY ("id_document") REFERENCES "documents"("id_document") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "paiements" ADD CONSTRAINT "paiements_id_utilisateur_fkey"
FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateurs"("id_utilisateur") ON DELETE CASCADE ON UPDATE CASCADE;
