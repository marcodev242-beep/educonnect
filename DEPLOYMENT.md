# Déploiement Render et migration Supabase

## Architecture préparée

Render héberge un unique service Node : il sert le front-end compilé et les routes API sur la même origine. Les copies et sujets téléversés restent sur le disque persistant Render monté dans `/var/data`; le disque est nécessaire, car le système de fichiers ordinaire d’un service Render est éphémère. Le service doit rester à une instance avec ce disque.

## 1. Créer et migrer la base Supabase

1. Créer un projet Supabase et relever sa chaîne PostgreSQL depuis **Connect**. Pour le serveur Render persistant, choisir le **Session pooler** (port 5432) et garder `sslmode=require`. Ne pas utiliser la clé `service_role` ni la clé anon à la place de `DATABASE_URL`.
2. Vérifier la version du projet Supabase avec `SHOW server_version;`. Le dump présent dans `prisma/current_database_schema.sql` annonce une source PostgreSQL 18.6 ; vérifier la compatibilité de version majeure avant la restauration.
3. Depuis un terminal qui a accès à la base actuelle, créer un dump cohérent. Remplacer les valeurs dans l’environnement du terminal, sans les enregistrer dans le dépôt :

   ```powershell
   $env:SOURCE_DATABASE_URL = 'URL_POSTGRESQL_ACTUELLE'
   $env:SUPABASE_DATABASE_URL = 'URL_SESSION_POOLER_SUPABASE'
   pg_dump --format=custom --no-owner --no-acl --file=supabase-migration.dump $env:SOURCE_DATABASE_URL
   pg_restore --no-owner --no-acl --exit-on-error --dbname=$env:SUPABASE_DATABASE_URL supabase-migration.dump
   ```

   Restaurer dans un projet/base Supabase vide. Le dump contient les données et le schéma PostgreSQL; ne pas lancer la restauration sur une base qui contient déjà des données à conserver. Conserver le dump comme sauvegarde, puis comparer les principales tables et les comptes avant le basculement.

4. Après validation, basculer `DATABASE_URL` vers la chaîne Supabase dans Render. L’application crée au démarrage les tables d’examens et de sessions nécessaires; la migration versionnée `20261119120000_auth_sessions` conserve aussi les sessions d’authentification.

## 2. Déployer sur Render

1. Pousser ce dépôt sur GitHub/GitLab puis créer un Blueprint Render à partir de `render.yaml`.
2. Renseigner dans Render les valeurs secrètes demandées par le Blueprint. Les principales sont `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, les identifiants YabisoPay et, si utilisés, Resend/WhatsApp.
3. Définir `ESCHOOL_CALLBACK_URL` comme `https://<service-render>/api/payments/yabiso-callback`. Dans Google Cloud Console, autoriser `https://<service-render>/api/auth/google/callback` et définir la même valeur dans `GOOGLE_REDIRECT_URI` si elle est renseignée explicitement.
4. `FRONTEND_URL` peut être omise : le serveur utilise `RENDER_EXTERNAL_URL`. Si un domaine personnalisé est utilisé, définir `FRONTEND_URL` sur ce domaine et mettre à jour les deux URI de callback.
5. Le service utilise `/health` comme contrôle de santé et `PORT` fourni par Render. `UPLOADS_DIR=/var/data/uploads` est préconfiguré dans le Blueprint.

## 3. Transférer les fichiers déjà téléversés

Les chemins des anciens fichiers sont conservés en base et sont résolus par nom dans le nouveau répertoire persistant. Il faut donc copier le contenu de l’ancien dossier `uploads/` vers le disque Render `/var/data/uploads` avant de compter sur les anciennes pièces jointes. Le fichier `.gitignore` exclut ce dossier pour éviter de publier les documents des utilisateurs dans Git.

## Exploitation

- Ne jamais exposer `DATABASE_URL`, les secrets OAuth ou les clés de paiement dans le front-end.
- Les routes actuelles accèdent à PostgreSQL directement depuis le serveur; aucune clé Supabase publique n’est requise pour l’application web.
- Le disque Render est attaché à une seule instance. Pour augmenter le nombre d’instances, déplacer les fichiers vers un stockage objet (par exemple Supabase Storage) avant de retirer le disque.
