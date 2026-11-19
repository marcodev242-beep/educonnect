-- Keep legacy UUID values unchanged while allowing readable IDs for new rows.
-- Foreign keys are recreated after both sides have been converted to TEXT.
ALTER TABLE utilisateurs DROP CONSTRAINT IF EXISTS utilisateurs_id_etablissement_fkey;
ALTER TABLE profils_enseignants DROP CONSTRAINT IF EXISTS profils_enseignants_id_utilisateur_fkey;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_id_enseignant_fkey;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_id_etablissement_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_id_utilisateur_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_id_etablissement_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_id_document_fkey;
ALTER TABLE paiements DROP CONSTRAINT IF EXISTS paiements_id_utilisateur_fkey;
ALTER TABLE paiements DROP CONSTRAINT IF EXISTS paiements_id_document_fkey;
ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_etablissement_fkey;
ALTER TABLE retraits_enseignants DROP CONSTRAINT IF EXISTS retraits_enseignants_id_enseignant_fkey;

ALTER TABLE etablissements ALTER COLUMN id_etablissement DROP DEFAULT;
ALTER TABLE utilisateurs ALTER COLUMN id_utilisateur DROP DEFAULT;
ALTER TABLE documents ALTER COLUMN id_document DROP DEFAULT;
ALTER TABLE paiements ALTER COLUMN id_paiement DROP DEFAULT;
ALTER TABLE abonnements ALTER COLUMN id_abonnement DROP DEFAULT;
ALTER TABLE retraits_enseignants ALTER COLUMN id_retrait DROP DEFAULT;

ALTER TABLE etablissements ALTER COLUMN id_etablissement TYPE TEXT USING id_etablissement::text;
ALTER TABLE utilisateurs ALTER COLUMN id_utilisateur TYPE TEXT USING id_utilisateur::text;
ALTER TABLE utilisateurs ALTER COLUMN id_etablissement TYPE TEXT USING id_etablissement::text;
ALTER TABLE profils_enseignants ALTER COLUMN id_utilisateur TYPE TEXT USING id_utilisateur::text;
ALTER TABLE documents ALTER COLUMN id_document TYPE TEXT USING id_document::text;
ALTER TABLE documents ALTER COLUMN id_enseignant TYPE TEXT USING id_enseignant::text;
ALTER TABLE documents ALTER COLUMN id_etablissement TYPE TEXT USING id_etablissement::text;
ALTER TABLE transactions ALTER COLUMN id_utilisateur TYPE TEXT USING id_utilisateur::text;
ALTER TABLE transactions ALTER COLUMN id_etablissement TYPE TEXT USING id_etablissement::text;
ALTER TABLE transactions ALTER COLUMN id_document TYPE TEXT USING id_document::text;
ALTER TABLE paiements ALTER COLUMN id_utilisateur TYPE TEXT USING id_utilisateur::text;
ALTER TABLE paiements ALTER COLUMN id_document TYPE TEXT USING id_document::text;
ALTER TABLE abonnements ALTER COLUMN id_etablissement TYPE TEXT USING id_etablissement::text;
ALTER TABLE retraits_enseignants ALTER COLUMN id_enseignant TYPE TEXT USING id_enseignant::text;
ALTER TABLE retraits_enseignants ALTER COLUMN id_retrait TYPE TEXT USING id_retrait::text;
ALTER TABLE paiements ALTER COLUMN id_paiement TYPE TEXT USING id_paiement::text;
ALTER TABLE abonnements ALTER COLUMN id_abonnement TYPE TEXT USING id_abonnement::text;
CREATE TABLE IF NOT EXISTS enseignant_etablissements (
  id_enseignant TEXT NOT NULL,
  id_etablissement TEXT NOT NULL,
  statut_approbation TEXT NOT NULL DEFAULT 'EN_ATTENTE',
  date_ajout TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_enseignant, id_etablissement)
);
ALTER TABLE enseignant_etablissements ALTER COLUMN id_enseignant TYPE TEXT USING id_enseignant::text;
ALTER TABLE enseignant_etablissements ALTER COLUMN id_etablissement TYPE TEXT USING id_etablissement::text;

CREATE SEQUENCE IF NOT EXISTS etablissements_id_seq;
CREATE SEQUENCE IF NOT EXISTS utilisateurs_id_seq;
CREATE SEQUENCE IF NOT EXISTS documents_id_seq;
CREATE SEQUENCE IF NOT EXISTS retraits_enseignants_id_seq;
CREATE SEQUENCE IF NOT EXISTS paiements_id_seq;
CREATE SEQUENCE IF NOT EXISTS abonnements_id_seq;
ALTER TABLE etablissements ALTER COLUMN id_etablissement SET DEFAULT ('EC' || lpad(nextval('etablissements_id_seq')::text, 9, '0'));
ALTER TABLE utilisateurs ALTER COLUMN id_utilisateur SET DEFAULT ('US' || lpad(nextval('utilisateurs_id_seq')::text, 9, '0'));
ALTER TABLE documents ALTER COLUMN id_document SET DEFAULT ('DC' || lpad(nextval('documents_id_seq')::text, 9, '0'));
ALTER TABLE retraits_enseignants ALTER COLUMN id_retrait DROP DEFAULT;
ALTER TABLE paiements ALTER COLUMN id_paiement DROP DEFAULT;
ALTER TABLE abonnements ALTER COLUMN id_abonnement DROP DEFAULT;
ALTER TABLE retraits_enseignants ALTER COLUMN id_retrait SET DEFAULT ('RT' || lpad(nextval('retraits_enseignants_id_seq')::text, 9, '0'));
ALTER TABLE paiements ALTER COLUMN id_paiement SET DEFAULT ('PA' || lpad(nextval('paiements_id_seq')::text, 9, '0'));
ALTER TABLE abonnements ALTER COLUMN id_abonnement SET DEFAULT ('AB' || lpad(nextval('abonnements_id_seq')::text, 9, '0'));

ALTER TABLE utilisateurs ADD CONSTRAINT utilisateurs_id_etablissement_fkey FOREIGN KEY (id_etablissement) REFERENCES etablissements(id_etablissement) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE profils_enseignants ADD CONSTRAINT profils_enseignants_id_utilisateur_fkey FOREIGN KEY (id_utilisateur) REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE documents ADD CONSTRAINT documents_id_enseignant_fkey FOREIGN KEY (id_enseignant) REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE documents ADD CONSTRAINT documents_id_etablissement_fkey FOREIGN KEY (id_etablissement) REFERENCES etablissements(id_etablissement) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT transactions_id_utilisateur_fkey FOREIGN KEY (id_utilisateur) REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT transactions_id_etablissement_fkey FOREIGN KEY (id_etablissement) REFERENCES etablissements(id_etablissement) ON DELETE CASCADE;
ALTER TABLE transactions ADD CONSTRAINT transactions_id_document_fkey FOREIGN KEY (id_document) REFERENCES documents(id_document) ON DELETE CASCADE;
ALTER TABLE paiements ADD CONSTRAINT paiements_id_utilisateur_fkey FOREIGN KEY (id_utilisateur) REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE;
ALTER TABLE paiements ADD CONSTRAINT paiements_id_document_fkey FOREIGN KEY (id_document) REFERENCES documents(id_document) ON DELETE CASCADE;
ALTER TABLE abonnements ADD CONSTRAINT abonnements_etablissement_fkey FOREIGN KEY (id_etablissement) REFERENCES etablissements(id_etablissement) ON DELETE CASCADE;
ALTER TABLE retraits_enseignants ADD CONSTRAINT retraits_enseignants_id_enseignant_fkey FOREIGN KEY (id_enseignant) REFERENCES profils_enseignants(id_utilisateur) ON DELETE CASCADE;

CREATE TABLE school_subscription_payments (
  reference TEXT PRIMARY KEY,
  reference_externe TEXT UNIQUE,
  id_etablissement TEXT NOT NULL REFERENCES etablissements(id_etablissement) ON DELETE CASCADE,
  montant NUMERIC(10, 2) NOT NULL,
  statut TEXT NOT NULL DEFAULT 'PENDING',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_confirmation TIMESTAMPTZ
);
CREATE INDEX school_subscription_payments_school_date_idx
  ON school_subscription_payments (id_etablissement, date_creation DESC);
