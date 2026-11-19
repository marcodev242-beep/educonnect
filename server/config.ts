import 'dotenv/config'

const frontendUrl = process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173'
const eschoolApiBaseUrl = (process.env.ESCHOOL_BASE_URL || 'https://www.eschoolapi.com').replace(/\/$/, '')

export const serverConfig = {
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL || '',
  frontendUrl,
  eschoolApiBaseUrl,
  subjectFixedPrice: Number(process.env.SUBJECT_FIXED_PRICE || 50),
  schoolSubscriptionPrice: 100, // Tarif mensuel de l'abonnement école en FCFA.
  teacherSubscriptionPrice: Number(process.env.TEACHER_SUBSCRIPTION_PRICE || 500), // Abonnement mensuel aux examens d'un enseignant.
  allowedOrigins: new Set([
    'http://www.eschoolapi.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    frontendUrl,
    process.env.RENDER_EXTERNAL_URL || frontendUrl,
  ]),
} as const

if (!serverConfig.databaseUrl) {
  throw new Error('DATABASE_URL est manquant dans le fichier .env')
}
