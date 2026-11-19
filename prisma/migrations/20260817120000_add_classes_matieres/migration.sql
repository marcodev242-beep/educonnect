-- Create join table classes_matieres
CREATE TABLE IF NOT EXISTS "classes_matieres" (
  "id_classe" TEXT NOT NULL,
  "id_matiere" TEXT NOT NULL,
  CONSTRAINT "classes_matieres_pkey" PRIMARY KEY ("id_classe", "id_matiere")
);

-- Foreign keys
ALTER TABLE "classes_matieres"
  ADD CONSTRAINT "classes_matieres_id_classe_fkey" FOREIGN KEY ("id_classe") REFERENCES "classes" ("id_classe") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "classes_matieres"
  ADD CONSTRAINT "classes_matieres_id_matiere_fkey" FOREIGN KEY ("id_matiere") REFERENCES "matieres" ("id_matiere") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "classes_matieres_id_classe_idx" ON "classes_matieres" ("id_classe");
CREATE INDEX IF NOT EXISTS "classes_matieres_id_matiere_idx" ON "classes_matieres" ("id_matiere");
