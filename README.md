
  # EduConnect Congo Platform

  This is a code bundle for EduConnect Congo Platform. The original project is available at https://www.figma.com/design/4MEwv5Q2YoGHXQewMrBpt9/EduConnect-Congo-Platform.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Google OAuth

  Pour activer la connexion et l'inscription Google, créer un client OAuth 2.0 de type application Web dans Google Cloud Console et ajouter dans `.env` :

  ```env
  GOOGLE_CLIENT_ID="..."
  GOOGLE_CLIENT_SECRET="..."
  GOOGLE_REDIRECT_URI="http://localhost:5000/api/auth/google/callback"
  FRONTEND_URL="http://localhost:5173"
  ```

  L'URI `http://localhost:5000/api/auth/google/callback` doit être enregistrée exactement dans les URI de redirection autorisées du client Google.
  