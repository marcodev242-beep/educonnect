BEGIN;

ALTER TABLE documents RENAME TO sujets;
ALTER SEQUENCE documents_id_seq RENAME TO sujets_id_seq;
ALTER TABLE sujets RENAME CONSTRAINT documents_pkey TO sujets_pkey;
ALTER TABLE sujets RENAME CONSTRAINT documents_id_classe_fkey TO sujets_id_classe_fkey;
ALTER TABLE sujets RENAME CONSTRAINT documents_id_enseignant_fkey TO sujets_id_enseignant_fkey;
ALTER TABLE sujets RENAME CONSTRAINT documents_id_etablissement_fkey TO sujets_id_etablissement_fkey;
ALTER TABLE sujets RENAME CONSTRAINT documents_id_matiere_fkey TO sujets_id_matiere_fkey;
ALTER TABLE sujets RENAME COLUMN id_document TO id_sujet;
ALTER TABLE transactions RENAME CONSTRAINT transactions_id_document_fkey TO transactions_id_sujet_fkey;
ALTER TABLE transactions RENAME COLUMN id_document TO id_sujet;
ALTER TABLE paiements RENAME CONSTRAINT paiements_id_document_fkey TO paiements_id_sujet_fkey;
ALTER TABLE paiements RENAME COLUMN id_document TO id_sujet;

ALTER TABLE classes ADD COLUMN code_classe TEXT;
ALTER TABLE matieres ADD COLUMN code_matiere TEXT;

WITH codes AS (
  SELECT id_classe,
    trim(both '-' FROM regexp_replace(upper(coalesce(nom_classe, '')), '[^A-Z0-9]+', '-', 'g')) AS base_code
  FROM classes
), resolved AS (
  SELECT id_classe,
    CASE
      WHEN base_code = '' THEN 'CL-' || regexp_replace(upper(id_classe), '[^A-Z0-9]+', '', 'g')
      WHEN count(*) OVER (PARTITION BY base_code) > 1
        THEN base_code || '-' || regexp_replace(upper(id_classe), '[^A-Z0-9]+', '', 'g')
      ELSE base_code
    END AS code
  FROM codes
)
UPDATE classes c SET code_classe = r.code
FROM resolved r WHERE c.id_classe = r.id_classe;

WITH codes AS (
  SELECT id_matiere,
    trim(both '-' FROM regexp_replace(upper(coalesce(nom_matiere, '')), '[^A-Z0-9]+', '-', 'g')) AS base_code
  FROM matieres
), resolved AS (
  SELECT id_matiere,
    CASE
      WHEN base_code = '' THEN 'MAT-' || regexp_replace(upper(id_matiere), '[^A-Z0-9]+', '', 'g')
      WHEN count(*) OVER (PARTITION BY base_code) > 1
        THEN base_code || '-' || regexp_replace(upper(id_matiere), '[^A-Z0-9]+', '', 'g')
      ELSE base_code
    END AS code
  FROM codes
)
UPDATE matieres m SET code_matiere = r.code
FROM resolved r WHERE m.id_matiere = r.id_matiere;

ALTER TABLE classes ALTER COLUMN code_classe SET NOT NULL;
ALTER TABLE matieres ALTER COLUMN code_matiere SET NOT NULL;
CREATE UNIQUE INDEX classes_code_classe_key ON classes (code_classe);
CREATE UNIQUE INDEX matieres_code_matiere_key ON matieres (code_matiere);

CREATE OR REPLACE FUNCTION generate_class_reference_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(NEW.code_classe, '') = '' THEN
    NEW.code_classe := trim(both '-' FROM regexp_replace(upper(coalesce(NEW.nom_classe, '')), '[^A-Z0-9]+', '-', 'g'));
    IF NEW.code_classe = '' THEN
      NEW.code_classe := 'CL-' || regexp_replace(upper(NEW.id_classe), '[^A-Z0-9]+', '', 'g');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('classe:' || NEW.code_classe));
    IF EXISTS (SELECT 1 FROM classes WHERE code_classe = NEW.code_classe) THEN
      NEW.code_classe := NEW.code_classe || '-' || regexp_replace(upper(NEW.id_classe), '[^A-Z0-9]+', '', 'g');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION generate_matiere_reference_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(NEW.code_matiere, '') = '' THEN
    NEW.code_matiere := trim(both '-' FROM regexp_replace(upper(coalesce(NEW.nom_matiere, '')), '[^A-Z0-9]+', '-', 'g'));
    IF NEW.code_matiere = '' THEN
      NEW.code_matiere := 'MAT-' || regexp_replace(upper(NEW.id_matiere), '[^A-Z0-9]+', '', 'g');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('matiere:' || NEW.code_matiere));
    IF EXISTS (SELECT 1 FROM matieres WHERE code_matiere = NEW.code_matiere) THEN
      NEW.code_matiere := NEW.code_matiere || '-' || regexp_replace(upper(NEW.id_matiere), '[^A-Z0-9]+', '', 'g');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER classes_reference_code_before_insert
BEFORE INSERT ON classes FOR EACH ROW EXECUTE FUNCTION generate_class_reference_code();
CREATE TRIGGER matieres_reference_code_before_insert
BEFORE INSERT ON matieres FOR EACH ROW EXECUTE FUNCTION generate_matiere_reference_code();

ALTER TABLE sujets ADD COLUMN reference_sujet TEXT;

WITH prefixes AS (
  SELECT s.id_sujet, c.code_classe || '-' || m.code_matiere AS prefix,
    row_number() OVER (
      PARTITION BY c.code_classe, m.code_matiere
      ORDER BY s.date_televersement, s.id_sujet
    ) AS sequence_number
  FROM sujets s
  JOIN classes c ON c.id_classe = s.id_classe
  JOIN matieres m ON m.id_matiere = s.id_matiere
)
UPDATE sujets s
SET reference_sujet = p.prefix || '-' ||
  lpad(p.sequence_number::text, greatest(5, length(p.sequence_number::text)), '0')
FROM prefixes p WHERE s.id_sujet = p.id_sujet;

ALTER TABLE sujets ALTER COLUMN reference_sujet SET NOT NULL;
CREATE UNIQUE INDEX sujets_reference_sujet_key ON sujets (reference_sujet);

CREATE OR REPLACE FUNCTION generate_subject_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  reference_prefix TEXT;
  next_number BIGINT;
BEGIN
  SELECT c.code_classe || '-' || m.code_matiere
  INTO reference_prefix
  FROM classes c CROSS JOIN matieres m
  WHERE c.id_classe = NEW.id_classe AND m.id_matiere = NEW.id_matiere;

  IF reference_prefix IS NULL THEN
    RAISE EXCEPTION 'Classe ou matière introuvable pour le sujet';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(reference_prefix));
  SELECT coalesce(max(substring(reference_sujet FROM '([0-9]+)$')::BIGINT), 0) + 1
  INTO next_number
  FROM sujets
  WHERE reference_sujet LIKE reference_prefix || '-%'
    AND reference_sujet ~ '-[0-9]+$';

  NEW.reference_sujet := reference_prefix || '-' ||
    lpad(next_number::text, greatest(5, length(next_number::text)), '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER sujets_reference_before_insert
BEFORE INSERT ON sujets FOR EACH ROW EXECUTE FUNCTION generate_subject_reference();

ALTER TABLE transactions ADD COLUMN reference_sujet TEXT;
UPDATE transactions t SET reference_sujet = s.reference_sujet
FROM sujets s WHERE s.id_sujet = t.id_sujet;
ALTER TABLE transactions ALTER COLUMN reference_sujet SET NOT NULL;

CREATE TABLE reference (
  type_reference TEXT NOT NULL,
  valeur TEXT NOT NULL,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT reference_pkey PRIMARY KEY (type_reference, valeur)
);

CREATE OR REPLACE FUNCTION register_business_reference(
  reference_type TEXT, reference_value TEXT
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(reference_value, '') = '' THEN
    RETURN;
  END IF;
  INSERT INTO reference (type_reference, valeur)
  VALUES (reference_type, reference_value)
  ON CONFLICT (type_reference, valeur) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION register_subject_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM register_business_reference('sujet', NEW.reference_sujet);
  RETURN NEW;
END;
$$;
CREATE TRIGGER sujets_reference_after_write
AFTER INSERT OR UPDATE OF reference_sujet ON sujets
FOR EACH ROW EXECUTE FUNCTION register_subject_reference();

CREATE OR REPLACE FUNCTION set_transaction_subject_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT s.reference_sujet INTO NEW.reference_sujet
  FROM sujets s WHERE s.id_sujet = NEW.id_sujet;
  IF NEW.reference_sujet IS NULL THEN
    RAISE EXCEPTION 'Sujet introuvable pour la transaction %', NEW.id_transaction;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER transactions_subject_reference_before_write
BEFORE INSERT OR UPDATE OF id_sujet, reference_sujet ON transactions
FOR EACH ROW EXECUTE FUNCTION set_transaction_subject_reference();

CREATE OR REPLACE FUNCTION register_transaction_references()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM register_business_reference('transaction_interne', NEW.ref_interne);
  PERFORM register_business_reference('transaction_externe', NEW.ref_externe);
  PERFORM register_business_reference('transaction_groupe', NEW.reference_groupe);
  PERFORM register_business_reference('transaction_operateur', NEW.ref_operateur);
  PERFORM register_business_reference('transaction_sujet', NEW.reference_sujet);
  RETURN NEW;
END;
$$;
CREATE TRIGGER transactions_references_after_write
AFTER INSERT OR UPDATE OF ref_interne, ref_externe, reference_groupe, ref_operateur, reference_sujet ON transactions
FOR EACH ROW EXECUTE FUNCTION register_transaction_references();

CREATE OR REPLACE FUNCTION register_payment_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM register_business_reference('paiement', NEW.reference);
  PERFORM register_business_reference('achat', NEW.numero_achat);
  RETURN NEW;
END;
$$;
CREATE TRIGGER paiements_reference_after_write
AFTER INSERT OR UPDATE OF reference, numero_achat ON paiements
FOR EACH ROW EXECUTE FUNCTION register_payment_reference();

CREATE OR REPLACE FUNCTION register_school_payment_references()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM register_business_reference('abonnement_interne', NEW.reference);
  PERFORM register_business_reference('abonnement_externe', NEW.reference_externe);
  RETURN NEW;
END;
$$;
CREATE TRIGGER school_subscription_references_after_write
AFTER INSERT OR UPDATE OF reference, reference_externe ON school_subscription_payments
FOR EACH ROW EXECUTE FUNCTION register_school_payment_references();

INSERT INTO reference (type_reference, valeur)
SELECT 'sujet', reference_sujet FROM sujets
UNION ALL
SELECT 'transaction_interne', ref_interne FROM transactions
UNION ALL
SELECT 'transaction_externe', ref_externe FROM transactions WHERE ref_externe IS NOT NULL
UNION ALL
SELECT 'transaction_groupe', reference_groupe FROM transactions WHERE reference_groupe IS NOT NULL
UNION ALL
SELECT 'transaction_operateur', ref_operateur FROM transactions WHERE ref_operateur IS NOT NULL
UNION ALL
SELECT 'transaction_sujet', reference_sujet FROM transactions
UNION ALL
SELECT 'paiement', reference FROM paiements
UNION ALL
SELECT 'achat', numero_achat FROM paiements
UNION ALL
SELECT 'abonnement_interne', reference FROM school_subscription_payments
UNION ALL
SELECT 'abonnement_externe', reference_externe
FROM school_subscription_payments WHERE reference_externe IS NOT NULL
ON CONFLICT (type_reference, valeur) DO NOTHING;

COMMIT;
