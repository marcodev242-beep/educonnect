CREATE TABLE "retraits_enseignants" (
  "id_retrait" UUID NOT NULL DEFAULT gen_random_uuid(),
  "id_enseignant" UUID NOT NULL,
  "montant" DECIMAL(10,2) NOT NULL,
  "numero_mobile" TEXT NOT NULL,
  "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
  "motif_rejet" TEXT,
  "date_demande" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "date_traitement" TIMESTAMPTZ,
  CONSTRAINT "retraits_enseignants_pkey" PRIMARY KEY ("id_retrait"),
  CONSTRAINT "retraits_enseignants_montant_check" CHECK ("montant" > 0),
  CONSTRAINT "retraits_enseignants_statut_check" CHECK ("statut" IN ('EN_ATTENTE', 'PAYE', 'REJETE')),
  CONSTRAINT "retraits_enseignants_id_enseignant_fkey" FOREIGN KEY ("id_enseignant")
    REFERENCES "profils_enseignants"("id_utilisateur") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "retraits_enseignants_id_enseignant_date_demande_idx"
  ON "retraits_enseignants"("id_enseignant", "date_demande");
CREATE INDEX "retraits_enseignants_statut_date_demande_idx"
  ON "retraits_enseignants"("statut", "date_demande");
