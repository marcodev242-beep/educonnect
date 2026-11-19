ALTER TABLE etablissements
  ADD COLUMN IF NOT EXISTS fuseau_horaire TEXT NOT NULL DEFAULT 'Africa/Brazzaville';

CREATE TABLE IF NOT EXISTS abonnements (
  id_abonnement UUID NOT NULL DEFAULT gen_random_uuid(),
  id_etablissement UUID NOT NULL,
  plan TEXT NOT NULL DEFAULT 'Mensuel',
  date_debut TIMESTAMPTZ NOT NULL,
  date_fin TIMESTAMPTZ NOT NULL,
  fuseau_horaire TEXT NOT NULL DEFAULT 'Africa/Brazzaville',
  statut TEXT NOT NULL DEFAULT 'ACTIVE',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT abonnements_pkey PRIMARY KEY (id_abonnement),
  CONSTRAINT abonnements_etablissement_fkey FOREIGN KEY (id_etablissement)
    REFERENCES etablissements(id_etablissement) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS abonnements_etablissement_fin_idx
  ON abonnements (id_etablissement, date_fin);