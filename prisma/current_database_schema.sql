--
-- PostgreSQL database dump
--

\restrict eut5hYhwqEZTPYYsPCdDhEVTWqx14Fx5UTkYEOVEeFtI068Uhe3hejBLtavcOyt

-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Name: abonnements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.abonnements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: abonnements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.abonnements (
    id_abonnement text DEFAULT ('AB'::text || lpad((nextval('public.abonnements_id_seq'::regclass))::text, 9, '0'::text)) NOT NULL,
    id_etablissement text NOT NULL,
    plan text DEFAULT 'Mensuel'::text NOT NULL,
    date_debut timestamp with time zone NOT NULL,
    date_fin timestamp with time zone NOT NULL,
    fuseau_horaire text DEFAULT 'Africa/Brazzaville'::text NOT NULL,
    statut text DEFAULT 'ACTIVE'::text NOT NULL,
    date_creation timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: niveaux; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.niveaux (
    id_classe text NOT NULL,
    nom_classe text NOT NULL,
    cycle text NOT NULL
);


--
-- Name: classes_matieres; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.classes_matieres (
    id_classe text NOT NULL,
    id_matiere text NOT NULL
);


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documents_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id_document text DEFAULT ('DOC'::text || lpad((nextval('public.documents_id_seq'::regclass))::text, 9, '0'::text)) NOT NULL,
    titre text NOT NULL,
    type_document text NOT NULL,
    url_fichier text DEFAULT '#'::text NOT NULL,
    prix numeric(10,2) DEFAULT 0.00 NOT NULL,
    statut text DEFAULT 'EN_ATTENTE'::text NOT NULL,
    motif_refus text DEFAULT ''::text,
    date_televersement timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id_enseignant text NOT NULL,
    id_etablissement text,
    id_classe text NOT NULL,
    id_matiere text NOT NULL,
    periode text DEFAULT ''::text,
    description text DEFAULT ''::text
);


--
-- Name: enseignant_etablissements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enseignant_etablissements (
    id_enseignant text NOT NULL,
    id_etablissement text NOT NULL,
    statut_approbation text DEFAULT 'EN_ATTENTE'::text NOT NULL,
    date_ajout timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: enseignants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.enseignants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: etablissements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.etablissements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: etablissements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etablissements (
    id_etablissement text DEFAULT ('EC'::text || lpad((nextval('public.etablissements_id_seq'::regclass))::text, 9, '0'::text)) NOT NULL,
    nom_etablissement text NOT NULL,
    numero_agrement text,
    email_officiel text NOT NULL,
    mot_de_passe text NOT NULL,
    telephone_contact text,
    ville text DEFAULT 'Brazzaville'::text NOT NULL,
    code_verification_otp text,
    est_verifie boolean DEFAULT false NOT NULL,
    date_creation timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    fuseau_horaire text DEFAULT 'Africa/Brazzaville'::text NOT NULL
);


--
-- Name: matieres; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matieres (
    id_matiere text NOT NULL,
    nom_matiere text NOT NULL
);


--
-- Name: paiements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.paiements_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: paiements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.paiements (
    id_paiement text DEFAULT ('PA'::text || lpad((nextval('public.paiements_id_seq'::regclass))::text, 9, '0'::text)) NOT NULL,
    type_utilisateur text NOT NULL,
    date_paiement timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id_document text NOT NULL,
    id_utilisateur text NOT NULL,
    numero_achat text NOT NULL,
    reference text NOT NULL,
    montant numeric(10,2) DEFAULT 0.00 NOT NULL
);


--
-- Name: password_resets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_resets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: profils_enseignants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profils_enseignants (
    id_utilisateur text NOT NULL,
    cycle text NOT NULL,
    matiere_principale text NOT NULL,
    solde_gagne numeric(10,2) DEFAULT 0.00 NOT NULL,
    statut_approbation text DEFAULT 'EN_ATTENTE'::text NOT NULL,
    photo_url text DEFAULT ''::text,
    biographie text DEFAULT ''::text,
    telephone text DEFAULT ''::text
);


--
-- Name: retraits_enseignants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.retraits_enseignants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: retraits_enseignants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retraits_enseignants (
    id_retrait text DEFAULT ('RT'::text || lpad((nextval('public.retraits_enseignants_id_seq'::regclass))::text, 9, '0'::text)) NOT NULL,
    id_enseignant text NOT NULL,
    montant numeric(10,2) NOT NULL,
    numero_mobile text NOT NULL,
    statut text DEFAULT 'EN_ATTENTE'::text NOT NULL,
    motif_rejet text,
    date_demande timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_traitement timestamp with time zone,
    CONSTRAINT retraits_enseignants_montant_check CHECK ((montant > (0)::numeric)),
    CONSTRAINT retraits_enseignants_statut_check CHECK ((statut = ANY (ARRAY['EN_ATTENTE'::text, 'PAYE'::text, 'REJETE'::text])))
);


--
-- Name: school_subscription_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.school_subscription_payments (
    reference text NOT NULL,
    reference_externe text,
    id_etablissement text NOT NULL,
    montant numeric(10,2) NOT NULL,
    statut text DEFAULT 'PENDING'::text NOT NULL,
    date_creation timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    date_confirmation timestamp with time zone,
    date_initiation timestamp with time zone
);


--
-- Name: transactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.transactions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id_transaction text DEFAULT ('TRX'::text || lpad((nextval('public.transactions_id_seq'::regclass))::text, 9, '0'::text)) NOT NULL,
    montant numeric(10,2) NOT NULL,
    statut_paiement text DEFAULT '1'::text NOT NULL,
    ref_externe text,
    date_achat timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id_document text NOT NULL,
    type_utilisateur integer DEFAULT 1 NOT NULL,
    id_utilisateur text,
    id_etablissement text,
    ref_interne text NOT NULL,
    ref_operateur text,
    msisdn text,
    message_statut text,
    reference_groupe text,
    CONSTRAINT transactions_type_utilisateur_check CHECK ((type_utilisateur = ANY (ARRAY[1, 2, 3])))
);


--
-- Name: utilisateurs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.utilisateurs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: utilisateurs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.utilisateurs (
    id_utilisateur text DEFAULT ('US'::text || lpad((nextval('public.utilisateurs_id_seq'::regclass))::text, 9, '0'::text)) NOT NULL,
    nom text NOT NULL,
    prenom text NOT NULL,
    email text NOT NULL,
    mot_de_passe text NOT NULL,
    role text NOT NULL,
    date_creation timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    id_etablissement text,
    telephone text DEFAULT ''::text
);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: abonnements abonnements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abonnements
    ADD CONSTRAINT abonnements_pkey PRIMARY KEY (id_abonnement);


--
-- Name: classes_matieres classes_matieres_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes_matieres
    ADD CONSTRAINT classes_matieres_pkey PRIMARY KEY (id_classe, id_matiere);


--
-- Name: niveaux niveaux_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.niveaux
    ADD CONSTRAINT niveaux_pkey PRIMARY KEY (id_classe);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id_document);


--
-- Name: enseignant_etablissements enseignant_etablissements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enseignant_etablissements
    ADD CONSTRAINT enseignant_etablissements_pkey PRIMARY KEY (id_enseignant, id_etablissement);


--
-- Name: etablissements etablissements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etablissements
    ADD CONSTRAINT etablissements_pkey PRIMARY KEY (id_etablissement);


--
-- Name: matieres matieres_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matieres
    ADD CONSTRAINT matieres_pkey PRIMARY KEY (id_matiere);


--
-- Name: paiements paiements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paiements
    ADD CONSTRAINT paiements_pkey PRIMARY KEY (id_paiement);


--
-- Name: paiements paiements_reference_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paiements
    ADD CONSTRAINT paiements_reference_key UNIQUE (reference);


--
-- Name: profils_enseignants profils_enseignants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profils_enseignants
    ADD CONSTRAINT profils_enseignants_pkey PRIMARY KEY (id_utilisateur);


--
-- Name: retraits_enseignants retraits_enseignants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retraits_enseignants
    ADD CONSTRAINT retraits_enseignants_pkey PRIMARY KEY (id_retrait);


--
-- Name: school_subscription_payments school_subscription_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_subscription_payments
    ADD CONSTRAINT school_subscription_payments_pkey PRIMARY KEY (reference);


--
-- Name: school_subscription_payments school_subscription_payments_reference_externe_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_subscription_payments
    ADD CONSTRAINT school_subscription_payments_reference_externe_key UNIQUE (reference_externe);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id_transaction);


--
-- Name: utilisateurs utilisateurs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_pkey PRIMARY KEY (id_utilisateur);


--
-- Name: abonnements_etablissement_fin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX abonnements_etablissement_fin_idx ON public.abonnements USING btree (id_etablissement, date_fin);


--
-- Name: classes_matieres_id_classe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classes_matieres_id_classe_idx ON public.classes_matieres USING btree (id_classe);


--
-- Name: classes_matieres_id_matiere_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX classes_matieres_id_matiere_idx ON public.classes_matieres USING btree (id_matiere);


--
-- Name: etablissements_email_officiel_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX etablissements_email_officiel_key ON public.etablissements USING btree (email_officiel);


--
-- Name: etablissements_numero_agrement_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX etablissements_numero_agrement_key ON public.etablissements USING btree (numero_agrement);


--
-- Name: retraits_enseignants_id_enseignant_date_demande_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX retraits_enseignants_id_enseignant_date_demande_idx ON public.retraits_enseignants USING btree (id_enseignant, date_demande);


--
-- Name: retraits_enseignants_statut_date_demande_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX retraits_enseignants_statut_date_demande_idx ON public.retraits_enseignants USING btree (statut, date_demande);


--
-- Name: school_subscription_payments_school_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX school_subscription_payments_school_date_idx ON public.school_subscription_payments USING btree (id_etablissement, date_creation DESC);


--
-- Name: transactions_ref_externe_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_ref_externe_key ON public.transactions USING btree (ref_externe);


--
-- Name: transactions_ref_interne_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX transactions_ref_interne_key ON public.transactions USING btree (ref_interne);


--
-- Name: transactions_reference_groupe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_reference_groupe_idx ON public.transactions USING btree (reference_groupe);


--
-- Name: transactions_type_utilisateur_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transactions_type_utilisateur_idx ON public.transactions USING btree (type_utilisateur);


--
-- Name: utilisateurs_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX utilisateurs_email_key ON public.utilisateurs USING btree (email);


--
-- Name: abonnements abonnements_etablissement_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.abonnements
    ADD CONSTRAINT abonnements_etablissement_fkey FOREIGN KEY (id_etablissement) REFERENCES public.etablissements(id_etablissement) ON DELETE CASCADE;


--
-- Name: classes_matieres classes_matieres_id_classe_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes_matieres
    ADD CONSTRAINT classes_matieres_id_classe_fkey FOREIGN KEY (id_classe) REFERENCES public.niveaux(id_classe) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: classes_matieres classes_matieres_id_matiere_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.classes_matieres
    ADD CONSTRAINT classes_matieres_id_matiere_fkey FOREIGN KEY (id_matiere) REFERENCES public.matieres(id_matiere) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: documents documents_id_classe_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_id_classe_fkey FOREIGN KEY (id_classe) REFERENCES public.niveaux(id_classe) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: documents documents_id_enseignant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_id_enseignant_fkey FOREIGN KEY (id_enseignant) REFERENCES public.utilisateurs(id_utilisateur) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: documents documents_id_etablissement_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_id_etablissement_fkey FOREIGN KEY (id_etablissement) REFERENCES public.etablissements(id_etablissement) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: documents documents_id_matiere_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_id_matiere_fkey FOREIGN KEY (id_matiere) REFERENCES public.matieres(id_matiere) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: paiements paiements_id_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paiements
    ADD CONSTRAINT paiements_id_document_fkey FOREIGN KEY (id_document) REFERENCES public.documents(id_document) ON DELETE CASCADE;


--
-- Name: paiements paiements_id_utilisateur_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.paiements
    ADD CONSTRAINT paiements_id_utilisateur_fkey FOREIGN KEY (id_utilisateur) REFERENCES public.utilisateurs(id_utilisateur) ON DELETE CASCADE;


--
-- Name: profils_enseignants profils_enseignants_id_utilisateur_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profils_enseignants
    ADD CONSTRAINT profils_enseignants_id_utilisateur_fkey FOREIGN KEY (id_utilisateur) REFERENCES public.utilisateurs(id_utilisateur) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: retraits_enseignants retraits_enseignants_id_enseignant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retraits_enseignants
    ADD CONSTRAINT retraits_enseignants_id_enseignant_fkey FOREIGN KEY (id_enseignant) REFERENCES public.profils_enseignants(id_utilisateur) ON DELETE CASCADE;


--
-- Name: school_subscription_payments school_subscription_payments_id_etablissement_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.school_subscription_payments
    ADD CONSTRAINT school_subscription_payments_id_etablissement_fkey FOREIGN KEY (id_etablissement) REFERENCES public.etablissements(id_etablissement) ON DELETE CASCADE;


--
-- Name: transactions transactions_id_document_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_id_document_fkey FOREIGN KEY (id_document) REFERENCES public.documents(id_document) ON DELETE CASCADE;


--
-- Name: transactions transactions_id_etablissement_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_id_etablissement_fkey FOREIGN KEY (id_etablissement) REFERENCES public.etablissements(id_etablissement) ON DELETE CASCADE;


--
-- Name: transactions transactions_id_utilisateur_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_id_utilisateur_fkey FOREIGN KEY (id_utilisateur) REFERENCES public.utilisateurs(id_utilisateur) ON DELETE CASCADE;


--
-- Name: utilisateurs utilisateurs_id_etablissement_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_id_etablissement_fkey FOREIGN KEY (id_etablissement) REFERENCES public.etablissements(id_etablissement) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

\unrestrict eut5hYhwqEZTPYYsPCdDhEVTWqx14Fx5UTkYEOVEeFtI068Uhe3hejBLtavcOyt

