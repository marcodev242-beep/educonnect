-- CreateTable
CREATE TABLE "classes" (
    "id_classe" TEXT NOT NULL,
    "nom_classe" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id_classe")
);

-- CreateTable
CREATE TABLE "matieres" (
    "id_matiere" TEXT NOT NULL,
    "nom_matiere" TEXT NOT NULL,

    CONSTRAINT "matieres_pkey" PRIMARY KEY ("id_matiere")
);

-- CreateTable
CREATE TABLE "etablissements" (
    "id_etablissement" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nom_etablissement" TEXT NOT NULL,
    "numero_agrement" TEXT NOT NULL,
    "email_officiel" TEXT NOT NULL,
    "mot_de_passe" TEXT NOT NULL,
    "telephone_contact" TEXT,
    "ville" TEXT NOT NULL DEFAULT 'Brazzaville',
    "code_verification_otp" TEXT,
    "est_verifie" BOOLEAN NOT NULL DEFAULT false,
    "date_creation" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etablissements_pkey" PRIMARY KEY ("id_etablissement")
);

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id_utilisateur" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mot_de_passe" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "date_creation" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_etablissement" UUID,

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id_utilisateur")
);

-- CreateTable
CREATE TABLE "profils_enseignants" (
    "id_utilisateur" UUID NOT NULL,
    "cycle" TEXT NOT NULL,
    "matiere_principale" TEXT NOT NULL,
    "solde_gagne" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "statut_approbation" TEXT NOT NULL DEFAULT 'EN_ATTENTE',

    CONSTRAINT "profils_enseignants_pkey" PRIMARY KEY ("id_utilisateur")
);

-- CreateTable
CREATE TABLE "documents" (
    "id_document" UUID NOT NULL DEFAULT gen_random_uuid(),
    "titre" TEXT NOT NULL,
    "description" TEXT DEFAULT '',
    "type_document" TEXT NOT NULL,
    "url_fichier" TEXT NOT NULL DEFAULT '#',
    "prix" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "motif_refus" TEXT DEFAULT '',
    "date_televersement" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_enseignant" UUID NOT NULL,
    "id_etablissement" UUID,
    "id_classe" TEXT NOT NULL,
    "id_matiere" TEXT NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id_document")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id_transaction" UUID NOT NULL DEFAULT gen_random_uuid(),
    "montant" DECIMAL(10,2) NOT NULL,
    "statut_paiement" TEXT NOT NULL DEFAULT 'SUCCESS',
    "reference_momo" TEXT,
    "date_achat" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "id_eleve" UUID NOT NULL,
    "id_document" UUID NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id_transaction")
);

-- CreateIndex
CREATE UNIQUE INDEX "etablissements_numero_agrement_key" ON "etablissements"("numero_agrement");

-- CreateIndex
CREATE UNIQUE INDEX "etablissements_email_officiel_key" ON "etablissements"("email_officiel");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_email_key" ON "utilisateurs"("email");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_reference_momo_key" ON "transactions"("reference_momo");

-- AddForeignKey
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_id_etablissement_fkey" FOREIGN KEY ("id_etablissement") REFERENCES "etablissements"("id_etablissement") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profils_enseignants" ADD CONSTRAINT "profils_enseignants_id_utilisateur_fkey" FOREIGN KEY ("id_utilisateur") REFERENCES "utilisateurs"("id_utilisateur") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_id_enseignant_fkey" FOREIGN KEY ("id_enseignant") REFERENCES "utilisateurs"("id_utilisateur") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_id_etablissement_fkey" FOREIGN KEY ("id_etablissement") REFERENCES "etablissements"("id_etablissement") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_id_classe_fkey" FOREIGN KEY ("id_classe") REFERENCES "classes"("id_classe") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_id_matiere_fkey" FOREIGN KEY ("id_matiere") REFERENCES "matieres"("id_matiere") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_id_eleve_fkey" FOREIGN KEY ("id_eleve") REFERENCES "utilisateurs"("id_utilisateur") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_id_document_fkey" FOREIGN KEY ("id_document") REFERENCES "documents"("id_document") ON DELETE CASCADE ON UPDATE CASCADE;
