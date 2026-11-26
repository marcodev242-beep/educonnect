import type pg from 'pg'

/**
 * Crée le schéma des examens test en ligne s'il n'existe pas.
 * Idempotent : appelable à chaque démarrage du serveur.
 */
export const ensureExamSchema = async (pool: pg.Pool): Promise<void> => {
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS examens_id_seq;
    CREATE SEQUENCE IF NOT EXISTS inscriptions_examens_id_seq;
    CREATE SEQUENCE IF NOT EXISTS copies_examens_id_seq;
    CREATE SEQUENCE IF NOT EXISTS notes_examens_id_seq;
    CREATE SEQUENCE IF NOT EXISTS avis_enseignants_id_seq;
    CREATE SEQUENCE IF NOT EXISTS abonnements_enseignants_id_seq;
    CREATE SEQUENCE IF NOT EXISTS paiements_examens_id_seq;

    CREATE TABLE IF NOT EXISTS examens (
      id_examen TEXT PRIMARY KEY DEFAULT ('EX' || lpad(nextval('examens_id_seq')::text, 9, '0')),
      titre TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      id_enseignant TEXT NOT NULL REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
      id_classe TEXT NOT NULL REFERENCES niveaux(id_classe) ON DELETE CASCADE,
      id_matiere TEXT NOT NULL REFERENCES matieres(id_matiere) ON DELETE CASCADE,
      prix_inscription DECIMAL(10, 2) NOT NULL DEFAULT 0,
      duree_minutes INTEGER NOT NULL DEFAULT 60,
      date_debut TIMESTAMPTZ NOT NULL,
      date_fin TIMESTAMPTZ NOT NULL,
      places_max INTEGER,
      url_sujet TEXT NOT NULL DEFAULT '#',
      fichiers_sujets JSONB NOT NULL DEFAULT '[]'::jsonb,
      statut TEXT NOT NULL DEFAULT 'ANNOUNCE',
      date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE examens ADD COLUMN IF NOT EXISTS fichiers_sujets JSONB NOT NULL DEFAULT '[]'::jsonb;
    UPDATE examens
    SET fichiers_sujets = jsonb_build_array(jsonb_build_object(
      'url', url_sujet, 'name', regexp_replace(url_sujet, '^.*/', ''), 'mime', NULL
    ))
    WHERE url_sujet <> '#' AND fichiers_sujets = '[]'::jsonb;

    ALTER TABLE examens DROP CONSTRAINT IF EXISTS examens_statut_check;
    ALTER TABLE examens ADD CONSTRAINT examens_statut_check
      CHECK (statut IN ('ANNOUNCE', 'EN_COURS', 'TERMINE', 'ANNULE'));
    ALTER TABLE examens DROP CONSTRAINT IF EXISTS examens_duree_check;
    ALTER TABLE examens ADD CONSTRAINT examens_duree_check
      CHECK (duree_minutes BETWEEN 15 AND 300);
    ALTER TABLE examens DROP CONSTRAINT IF EXISTS examens_dates_check;
    ALTER TABLE examens ADD CONSTRAINT examens_dates_check CHECK (date_fin > date_debut);

    CREATE INDEX IF NOT EXISTS idx_examens_statut_date ON examens (statut, date_debut);
    CREATE INDEX IF NOT EXISTS idx_examens_enseignant ON examens (id_enseignant, date_creation);

    CREATE TABLE IF NOT EXISTS inscriptions_examens (
      id_inscription TEXT PRIMARY KEY
        DEFAULT ('IN' || lpad(nextval('inscriptions_examens_id_seq')::text, 9, '0')),
      id_examen TEXT NOT NULL REFERENCES examens(id_examen) ON DELETE CASCADE,
      id_eleve TEXT NOT NULL REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
      statut TEXT NOT NULL DEFAULT 'EN_ATTENTE_PAIEMENT',
      reference_paiement TEXT,
      date_inscription TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (id_examen, id_eleve)
    );

    ALTER TABLE inscriptions_examens DROP CONSTRAINT IF EXISTS inscriptions_examens_statut_check;
    ALTER TABLE inscriptions_examens ADD CONSTRAINT inscriptions_examens_statut_check
      CHECK (statut IN ('EN_ATTENTE_PAIEMENT', 'PAYE', 'GRATUIT_ABONNEMENT', 'DEMANDE_ANNULATION', 'ANNULE'));

    CREATE INDEX IF NOT EXISTS idx_inscriptions_eleve
      ON inscriptions_examens (id_eleve, date_inscription);

    CREATE TABLE IF NOT EXISTS copies_examens (
      id_copie TEXT PRIMARY KEY
        DEFAULT ('CP' || lpad(nextval('copies_examens_id_seq')::text, 9, '0')),
      id_examen TEXT NOT NULL REFERENCES examens(id_examen) ON DELETE CASCADE,
      id_eleve TEXT NOT NULL REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
      url_fichier TEXT NOT NULL,
      type_fichier TEXT,
      nom_fichier TEXT,
      date_depot TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_copies_examen_eleve
      ON copies_examens (id_examen, id_eleve);

    CREATE TABLE IF NOT EXISTS notes_examens (
      id_note TEXT PRIMARY KEY
        DEFAULT ('NT' || lpad(nextval('notes_examens_id_seq')::text, 9, '0')),
      id_examen TEXT NOT NULL REFERENCES examens(id_examen) ON DELETE CASCADE,
      id_eleve TEXT NOT NULL REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
      valeur DECIMAL(5, 2) NOT NULL CHECK (valeur >= 0 AND valeur <= 20),
      appreciation TEXT NOT NULL DEFAULT '',
      url_corrige TEXT NOT NULL DEFAULT '',
      statut TEXT NOT NULL DEFAULT 'PUBLIE',
      date_correction TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (id_examen, id_eleve)
    );

    ALTER TABLE notes_examens DROP CONSTRAINT IF EXISTS notes_examens_statut_check;
    ALTER TABLE notes_examens ADD CONSTRAINT notes_examens_statut_check
      CHECK (statut IN ('CORRIGE', 'PUBLIE'));

    CREATE TABLE IF NOT EXISTS avis_enseignants (
      id_avis TEXT PRIMARY KEY
        DEFAULT ('AV' || lpad(nextval('avis_enseignants_id_seq')::text, 9, '0')),
      id_enseignant TEXT NOT NULL REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
      id_eleve TEXT NOT NULL REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
      id_examen TEXT NOT NULL REFERENCES examens(id_examen) ON DELETE CASCADE,
      etoiles INTEGER NOT NULL CHECK (etoiles BETWEEN 1 AND 5),
      commentaire TEXT NOT NULL DEFAULT '',
      date_avis TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (id_examen, id_eleve)
    );

    CREATE INDEX IF NOT EXISTS idx_avis_enseignant
      ON avis_enseignants (id_enseignant, date_avis);

    CREATE TABLE IF NOT EXISTS abonnements_enseignants (
      id_abonnement TEXT PRIMARY KEY
        DEFAULT ('AE' || lpad(nextval('abonnements_enseignants_id_seq')::text, 9, '0')),
      id_eleve TEXT NOT NULL REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
      id_enseignant TEXT NOT NULL REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'Mensuel',
      date_debut TIMESTAMPTZ NOT NULL,
      date_fin TIMESTAMPTZ NOT NULL,
      montant DECIMAL(10, 2) NOT NULL DEFAULT 0,
      statut TEXT NOT NULL DEFAULT 'ACTIVE',
      date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE abonnements_enseignants DROP CONSTRAINT IF EXISTS abonnements_enseignants_statut_check;
    ALTER TABLE abonnements_enseignants ADD CONSTRAINT abonnements_enseignants_statut_check
      CHECK (statut IN ('ACTIVE', 'EXPIRE', 'ANNULE'));

    CREATE INDEX IF NOT EXISTS idx_abonnements_enseignants_eleve
      ON abonnements_enseignants (id_eleve, id_enseignant, date_fin);

    CREATE TABLE IF NOT EXISTS paiements_examens (
      id_paiement_examen TEXT PRIMARY KEY
        DEFAULT ('PX' || lpad(nextval('paiements_examens_id_seq')::text, 9, '0')),
      reference TEXT NOT NULL UNIQUE,
      reference_externe TEXT,
      type_paiement TEXT NOT NULL,
      id_examen TEXT REFERENCES examens(id_examen) ON DELETE CASCADE,
      id_eleve TEXT NOT NULL REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
      id_enseignant TEXT REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE,
      montant DECIMAL(10, 2) NOT NULL DEFAULT 0,
      statut TEXT NOT NULL DEFAULT 'PENDING',
      date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      date_initiation TIMESTAMPTZ,
      date_traitement TIMESTAMPTZ
    );

    ALTER TABLE paiements_examens DROP CONSTRAINT IF EXISTS paiements_examens_type_check;
    ALTER TABLE paiements_examens ADD CONSTRAINT paiements_examens_type_check
      CHECK (type_paiement IN ('INSCRIPTION', 'ABONNEMENT_ENSEIGNANT'));
    ALTER TABLE paiements_examens DROP CONSTRAINT IF EXISTS paiements_examens_statut_check;
    ALTER TABLE paiements_examens ADD CONSTRAINT paiements_examens_statut_check
      CHECK (statut IN ('PENDING', 'SUCCESS', 'FAILED'));

    CREATE INDEX IF NOT EXISTS idx_paiements_examens_eleve
      ON paiements_examens (id_eleve, date_creation);
  `)
}
