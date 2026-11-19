# Guidelines EduConnect Congo

## Contexte produit

EduConnect Congo est une plateforme de vente et de validation de sujets scolaires pour le Congo. L'application couvre quatre espaces principaux : eleve, enseignant, etablissement scolaire et administrateur.

Les parcours importants sont :

- Catalogue public des sujets valides, avec recherche et filtres par classe et matiere.
- Achat eleve via parcours Mobile Money simule, puis acces aux documents achetes.
- Inscription enseignant, rattachement a une ecole, profil public, depot de sujets et suivi du portefeuille.
- Validation des enseignants et des sujets par les etablissements.
- Validation des etablissements et supervision par l'administrateur.

## Stack et architecture

- Frontend : React 18, TypeScript, Vite, Tailwind CSS 4, composants Radix/shadcn, icones `lucide-react`, graphiques `recharts`.
- Backend : Express dans `server.ts`, PostgreSQL via `pg`, uploads via `multer`, SSE pour les rafraichissements et validations.
- Donnees : schema Prisma dans `prisma/schema.prisma`, mais le backend actuel utilise surtout des requetes SQL directes avec `pg`.
- Point d'entree frontend : `src/main.tsx`, application principale dans `src/app/App.tsx`.
- Types partages cote app : `src/app/types.ts`.

## Organisation du code

- Placer les pages de role dans `src/app/pages`.
- Placer les composants reutilisables metier dans `src/app/components`.
- Garder les composants generiques shadcn/Radix dans `src/app/components/ui` et eviter de les modifier sauf besoin explicite.
- Centraliser les formes de donnees visibles par le frontend dans `src/app/types.ts`.
- Eviter d'ajouter une nouvelle bibliotheque si un composant ou helper existant couvre deja le besoin.
- Ne pas modifier `dist`, `node_modules` ou les fichiers dans `uploads` pour une evolution applicative normale.

## Conventions React

- Utiliser des composants fonctionnels TypeScript.
- Preferer des props explicites et typees plutot que des objets `any`.
- Garder l'etat local pres de la vue qui l'utilise ; remonter l'etat uniquement quand plusieurs vues en dependent.
- Pour les appels API, verifier `response.ok`, afficher un message clair a l'utilisateur et journaliser le detail technique avec `console.error`.
- Quand une action change le catalogue, rafraichir les donnees via les callbacks existants comme `onCatalogRefresh` ou via les endpoints deja disponibles.
- Nettoyer les souscriptions SSE, timers et URLs temporaires dans les effets lorsque c'est pertinent.

## API et donnees

- Conserver les routes sous le prefixe `/api`.
- Normaliser les entrees utilisateur cote serveur avec les helpers existants (`normalizeEmail`, `normalizeText`) ou un helper equivalent.
- Utiliser des requetes SQL parametrees ; ne jamais interpoler directement une valeur utilisateur dans une requete.
- Respecter les statuts existants : `EN_ATTENTE`, `VALIDE`, `REJETE` pour enseignants et documents ; `PENDING`, `SUCCESS`, `FAILED` pour paiements.
- Les roles applicatifs sont `student`, `teacher`, `school`, `admin`. Les valeurs stockees en base peuvent etre en francais ; mapper proprement entre les deux mondes.
- Les montants sont en FCFA. Conserver des nombres cote API et formater seulement dans l'UI.
- Les mots de passe doivent rester hashes avec le mecanisme existant ; ne pas revenir a un stockage en clair.

## Design UI

- Conserver l'identite actuelle : interface claire, scolaire, professionnelle, accent principal vert/teal, fonds doux et cartes blanches translucides.
- Utiliser en priorite les classes et tokens existants dans `src/styles/theme.css`.
- Employer `lucide-react` pour les icones d'action.
- Garder des interfaces compactes et scannables pour les dashboards ; eviter les sections marketing inutiles dans les espaces metier.
- Assurer le responsive mobile : les grilles doivent passer en une colonne, les boutons ne doivent pas deborder, les textes longs doivent etre tronques ou revenir a la ligne.
- Pour les actions critiques comme valider, rejeter, revoquer, acheter ou deposer un fichier, montrer un etat de succes, d'erreur ou de chargement clair.

## Langue et contenu

- L'interface cible des utilisateurs francophones au Congo : ecrire les libelles en francais clair.
- Utiliser les termes metier coherents : sujet, classe, matiere, etablissement, enseignant, eleve, agrement, validation, Mobile Money, FCFA.
- Preserver un encodage UTF-8 propre. Si une zone modifiee contient des accents transformes en suites illisibles, les corriger dans la meme intervention.
- Ne pas melanger les libelles anglais et francais dans l'UI, sauf pour des noms techniques invisibles ou des valeurs d'API.

## Qualite et verification

- Avant de terminer une modification applicative, lancer au minimum `npm run build` quand le changement touche TypeScript, React, Vite ou le serveur.
- Verifier manuellement les parcours touches : connexion/inscription, depot de sujet, validation, achat ou catalogue selon le cas.
- Garder les changements scopes au besoin demande. Ne pas refactorer tout `server.ts` ou les dashboards sans raison directe.
- Si une modification touche le schema de donnees, documenter clairement la migration attendue et son impact sur les donnees existantes.
- Ne jamais ajouter de secrets, identifiants reels ou cles API dans le code source.
