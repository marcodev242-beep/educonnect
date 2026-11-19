BEGIN;

ALTER TABLE classes RENAME TO niveaux;
ALTER TABLE niveaux RENAME CONSTRAINT classes_pkey TO niveaux_pkey;
ALTER INDEX classes_code_classe_key RENAME TO niveaux_code_classe_key;
ALTER TRIGGER classes_reference_code_before_insert ON niveaux RENAME TO niveaux_reference_code_before_insert;

CREATE OR REPLACE FUNCTION generate_class_reference_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(NEW.code_classe, '') = '' THEN
    NEW.code_classe := trim(both '-' FROM regexp_replace(upper(coalesce(NEW.nom_classe, '')), '[^A-Z0-9]+', '-', 'g'));
    IF NEW.code_classe = '' THEN
      NEW.code_classe := 'CL-' || regexp_replace(upper(NEW.id_classe), '[^A-Z0-9]+', '', 'g');
    END IF;
    PERFORM pg_advisory_xact_lock(hashtext('classe:' || NEW.code_classe));
    IF EXISTS (SELECT 1 FROM niveaux WHERE code_classe = NEW.code_classe) THEN
      NEW.code_classe := NEW.code_classe || '-' || regexp_replace(upper(NEW.id_classe), '[^A-Z0-9]+', '', 'g');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION generate_subject_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  reference_prefix TEXT;
  next_number BIGINT;
BEGIN
  SELECT n.code_classe || '-' || m.code_matiere
  INTO reference_prefix
  FROM niveaux n CROSS JOIN matieres m
  WHERE n.id_classe = NEW.id_classe AND m.id_matiere = NEW.id_matiere;

  IF reference_prefix IS NULL THEN
    RAISE EXCEPTION 'Niveau ou matière introuvable pour le sujet';
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

COMMIT;