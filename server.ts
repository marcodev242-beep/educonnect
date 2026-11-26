import type { NextFunction, Request, Response } from 'express'
import express from 'express'
import fs from 'node:fs'
import pg from 'pg'
import 'dotenv/config'
import crypto from 'node:crypto'
import path from 'node:path'
import { promisify } from 'node:util'
import { serverConfig } from './server/config.js'
import { app } from './server/app.js'
import { errorHandler, notFoundHandler } from './server/middleware/error-handler.js'
import { upload, uploadDirectory, resolveUploadPath } from './server/middleware/upload.js'
import {
  findYabisoCode,
  findYabisoMessage,
  findYabisoReference,
  findYabisoStatus,
  getYabisoStatus,
  isFailedYabisoStatus,
  isSuccessfulYabisoStatus,
  requestYabisoPayment,
} from './server/services/yabiso-pay.js'
import { ensureExamSchema } from './server/exam-schema.js'
import { finalizeExamPayment, registerExamRoutes } from './server/exam-routes.js'

const { Pool } = pg
const PORT = serverConfig.port
const DATABASE_URL = serverConfig.databaseUrl

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 5),
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
})

type UserRole = 'student' | 'teacher' | 'school' | 'admin'
type SessionUser = { id: string; role: UserRole; schoolId?: string | null }

const TRANSACTION_USER_TYPE = {
  public: 1,
  enseignant: 2,
  ecole: 3,
} as const

const transactionUserTypeForRole = (role: UserRole) => {
  if (role === 'teacher') return TRANSACTION_USER_TYPE.enseignant
  if (role === 'school') return TRANSACTION_USER_TYPE.ecole
  return TRANSACTION_USER_TYPE.public
}

const googleStates = new Map<string, { mode: 'login' | 'register'; role: UserRole; expiresAt: number }>()
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
const PAYMENT_CONFIRMATION_TIMEOUT_MS = 60_000
const SUBJECT_FIXED_PRICE = serverConfig.subjectFixedPrice
const SCHOOL_SUBSCRIPTION_PRICE = serverConfig.schoolSubscriptionPrice

const normalizeAssetUrl = (value: any) => {
  if (!value) return ''
  const path = String(value).replace(/\\/g, '/')
  return path.startsWith('/') ? path : `/${path}`
}

const parseCookies = (header: string | undefined) => Object.fromEntries(
  (header || '').split(';').filter(Boolean).map(part => {
    const [key, ...value] = part.trim().split('=')
    return [key, decodeURIComponent(value.join('='))]
  }),
)

const setSession = async (res: Response, user: SessionUser) => {
  const token = crypto.randomBytes(32).toString('hex')
  await pool.query(
    `INSERT INTO auth_sessions (token, id_user, role, id_school, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 * INTERVAL '1 millisecond'))`,
    [token, user.id, user.role, user.schoolId || null, SESSION_TTL_MS],
  )
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.setHeader('Set-Cookie', `educonnect_session=${token}; Max-Age=${SESSION_TTL_MS / 1000}; Path=/; HttpOnly; SameSite=Lax${secure}`)
}

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const token = parseCookies(req.headers.cookie).educonnect_session
  if (!token) return res.status(401).json({ error: 'Authentification requise' })
  try {
    const result = await pool.query(
      `SELECT id_user, role, id_school FROM auth_sessions WHERE token = $1 AND expires_at > NOW() LIMIT 1`,
      [token],
    )
    if (!result.rowCount) {
      await pool.query('DELETE FROM auth_sessions WHERE token = $1', [token])
      return res.status(401).json({ error: 'Authentification requise' })
    }
    ;(req as any).auth = {
      id: result.rows[0].id_user,
      role: result.rows[0].role,
      schoolId: result.rows[0].id_school,
    } satisfies SessionUser
    return next()
  } catch (error) {
    return next(error)
  }
}

const requireRole = (...roles: UserRole[]) => (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).auth as SessionUser | undefined
  if (!user || !roles.includes(user.role)) return res.status(403).json({ error: 'Droits insuffisants' })
  next()
}

const requireOwner = (req: Request, res: Response, id: string) => {
  const user = (req as any).auth as SessionUser
  if (user.role === 'admin' || user.id === id) return true
  res.status(403).json({ error: 'Acces non autorise' })
  return false
}

const googleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `${serverConfig.frontendUrl}/api/auth/google/callback`,
}
const frontendUrl = serverConfig.frontendUrl
const googleRedirect = (query: string) => `${frontendUrl}/?${query}`

app.get('/api/auth/google/start', (req, res) => {
  if (!googleConfig.clientId || !googleConfig.clientSecret) {
    return res.redirect(googleRedirect(`google_error=${encodeURIComponent('La connexion Google n’est pas configurée sur le serveur.')}`))
  }
  const mode = normalizeText(req.query.mode) === 'register' ? 'register' : 'login'
  const requestedRole = normalizeText(req.query.role)
  const role: UserRole = ['student', 'teacher', 'school'].includes(requestedRole) ? requestedRole as UserRole : 'student'
  const state = crypto.randomBytes(24).toString('hex')
  googleStates.set(state, { mode, role, expiresAt: Date.now() + 10 * 60 * 1000 })
  const params = new URLSearchParams({
    client_id: googleConfig.clientId,
    redirect_uri: googleConfig.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'select_account',
  })
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
})

app.get('/api/auth/google/callback', async (req, res) => {
  const state = normalizeText(req.query.state)
  const code = normalizeText(req.query.code)
  const savedState = googleStates.get(state)
  googleStates.delete(state)
  if (!savedState || savedState.expiresAt <= Date.now() || !code) {
    return res.redirect(googleRedirect('google_error=Session+Google+invalide+ou+expiree'))
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleConfig.clientId,
        client_secret: googleConfig.clientSecret,
        redirect_uri: googleConfig.redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenResponse.ok) throw new Error('Echange du code Google impossible')
    const tokenData = await tokenResponse.json() as { access_token?: string }
    if (!tokenData.access_token) throw new Error('Token Google absent')

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    if (!profileResponse.ok) throw new Error('Profil Google inaccessible')
    const profile = await profileResponse.json() as { email?: string; given_name?: string; family_name?: string; name?: string; email_verified?: boolean }
    const email = normalizeEmail(profile.email)
    if (!email || profile.email_verified === false) throw new Error('Email Google non vÃ©rifiÃ©')

    const existingSchool = await pool.query(
      `SELECT id_etablissement, nom_etablissement, email_officiel, telephone_contact, est_verifie
       FROM etablissements WHERE lower(email_officiel) = $1 LIMIT 1`, [email],
    )
    if (existingSchool.rowCount) {
      const user = authUserResponse(existingSchool.rows[0], 'school')
      await setSession(res, { id: user.id, role: 'school' })
      return res.redirect(googleRedirect('google=success'))
    }

    const existingUser = await pool.query(
      `SELECT id_utilisateur, nom, prenom, email, telephone, role, id_etablissement
       FROM utilisateurs WHERE lower(email) = $1 LIMIT 1`, [email],
    )
    if (existingUser.rowCount) {
      const role = toAppRole(existingUser.rows[0].role)
      const user = authUserResponse(existingUser.rows[0], role)
      await setSession(res, { id: user.id, role, schoolId: existingUser.rows[0].id_etablissement })
      return res.redirect(googleRedirect('google=success'))
    }

    if (savedState.mode === 'login') {
      return res.redirect(googleRedirect(`google_error=${encodeURIComponent('Aucun compte n’est associé à cette adresse Google. Choisissez Inscription pour créer un compte.')}`))
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const googleName = splitFullName(profile.name || email)
      const firstName = normalizeText(profile.given_name) || googleName.prenom
      const lastName = normalizeText(profile.family_name) || googleName.nom
      const randomPassword = await hashPassword(crypto.randomBytes(32).toString('hex'))
      if (savedState.role === 'school') {
        const result = await client.query(
          `INSERT INTO etablissements (nom_etablissement, email_officiel, mot_de_passe, ville, est_verifie)
           VALUES ($1, $2, $3, 'Brazzaville', true)
           RETURNING id_etablissement, nom_etablissement, email_officiel, est_verifie`,
          [`Etablissement de ${firstName}`, email, randomPassword],
        )
        const user = authUserResponse(result.rows[0], 'school')
        await client.query('COMMIT')
        await setSession(res, { id: user.id, role: 'school' })
        return res.redirect(googleRedirect('google=success'))
      }

      const dbRole = savedState.role === 'teacher' ? 'Enseignant' : 'Grand public'
      const result = savedState.role === 'teacher'
        ? await client.query(
          `INSERT INTO utilisateurs (id_utilisateur, nom, prenom, email, mot_de_passe, role)
           VALUES ('ENS' || lpad(nextval('enseignants_id_seq')::text, 9, '0'), $1, $2, $3, $4, $5)
           RETURNING id_utilisateur, nom, prenom, email, role`,
          [lastName, firstName, email, randomPassword, dbRole],
        )
        : await client.query(
          `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id_utilisateur, nom, prenom, email, role`,
          [lastName, firstName, email, randomPassword, dbRole],
        )
      if (savedState.role === 'teacher') {
        await client.query(
          `INSERT INTO profils_enseignants (id_utilisateur, cycle, matiere_principale, statut_approbation)
           VALUES ($1, 'CollÃ¨ge', 'Non renseignÃ©e', 'VALIDE')`,
          [result.rows[0].id_utilisateur],
        )
      }
      await client.query('COMMIT')
      const user = authUserResponse(result.rows[0], savedState.role)
      await setSession(res, { id: user.id, role: savedState.role })
      return res.redirect(googleRedirect('google=success'))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Erreur OAuth Google:', error)
    return res.redirect(googleRedirect(`google_error=${encodeURIComponent('La connexion Google a échoué. Vérifiez la configuration OAuth et réessayez.')}`))
  }
})

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const auth = (req as any).auth as SessionUser
  const result = await pool.query(
    `SELECT id_utilisateur, nom, prenom, email, telephone, role, id_etablissement FROM utilisateurs WHERE id_utilisateur = $1 LIMIT 1`,
    [auth.id],
  )
  if (result.rowCount) return res.json({ user: authUserResponse(result.rows[0], auth.role) })
  const school = await pool.query(
    `SELECT id_etablissement, nom_etablissement, email_officiel, telephone_contact, est_verifie FROM etablissements WHERE id_etablissement = $1 LIMIT 1`,
    [auth.id],
  )
  if (!school.rowCount) return res.status(404).json({ error: 'Session introuvable' })
  return res.json({ user: authUserResponse(school.rows[0], 'school') })
})

app.post('/api/auth/timezone', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as SessionUser
    const timezone = normalizeText(req.body.timezone)
    if (!timezone || timezone.length > 80) return res.status(400).json({ error: 'Fuseau horaire invalide' })
    if (auth.role === 'school') {
      await pool.query('UPDATE etablissements SET fuseau_horaire = $1 WHERE id_etablissement = $2', [timezone, auth.id])
    }
    res.json({ ok: true, timezone })
  } catch (error) {
    console.error('Erreur fuseau horaire:', error)
    res.status(500).json({ error: 'Impossible de mettre Ã  jour le fuseau horaire' })
  }
})

// Ensure password_resets table exists
const ensurePasswordResetsTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id UUID NOT NULL DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

// Call once at startup
ensurePasswordResetsTable().catch(err => console.error('Impossible de creer password_resets table', err))

const ensureTeacherProfileSchema = async () => {
  await pool.query(`
    ALTER TABLE etablissements
      ALTER COLUMN numero_agrement DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS fuseau_horaire TEXT NOT NULL DEFAULT 'Africa/Brazzaville'
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS enseignant_etablissements (
      id_enseignant TEXT NOT NULL,
      id_etablissement TEXT NOT NULL,
      statut_approbation TEXT NOT NULL DEFAULT 'EN_ATTENTE',
      date_ajout TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_enseignant, id_etablissement)
    )
  `)

  await pool.query(`
    ALTER TABLE profils_enseignants
      ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS biographie TEXT DEFAULT ''
  `)

  await pool.query(`
    ALTER TABLE profils_enseignants
      ADD COLUMN IF NOT EXISTS telephone TEXT DEFAULT ''
  `)

  await pool.query(`
    ALTER TABLE utilisateurs
      ADD COLUMN IF NOT EXISTS telephone TEXT DEFAULT ''
  `)

  await pool.query(`
    ALTER TABLE sujets
      ADD COLUMN IF NOT EXISTS periode TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS paiements (
      id_paiement TEXT NOT NULL DEFAULT ('PA' || lpad(nextval('paiements_id_seq')::text, 9, '0')),
      type_utilisateur TEXT NOT NULL,
      date_paiement TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      id_sujet TEXT NOT NULL,
      id_utilisateur TEXT NOT NULL,
      numero_achat TEXT NOT NULL,
      reference TEXT NOT NULL,
      montant DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
      CONSTRAINT paiements_pkey PRIMARY KEY (id_paiement),
      CONSTRAINT paiements_reference_key UNIQUE (reference),
      CONSTRAINT paiements_id_sujet_fkey FOREIGN KEY (id_sujet) REFERENCES sujets(id_sujet) ON DELETE CASCADE,
      CONSTRAINT paiements_id_utilisateur_fkey FOREIGN KEY (id_utilisateur) REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS abonnements (
      id_abonnement TEXT NOT NULL DEFAULT ('AB' || lpad(nextval('abonnements_id_seq')::text, 9, '0')),
      id_etablissement TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT 'Mensuel',
      date_debut TIMESTAMPTZ NOT NULL,
      date_fin TIMESTAMPTZ NOT NULL,
      fuseau_horaire TEXT NOT NULL DEFAULT 'Africa/Brazzaville',
      statut TEXT NOT NULL DEFAULT 'ACTIVE',
      date_creation TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT abonnements_pkey PRIMARY KEY (id_abonnement),
      CONSTRAINT abonnements_etablissement_fkey FOREIGN KEY (id_etablissement) REFERENCES etablissements(id_etablissement) ON DELETE CASCADE
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS abonnements_etablissement_fin_idx ON abonnements (id_etablissement, date_fin)`)

  await pool.query(`
    ALTER TABLE transactions
      ADD COLUMN IF NOT EXISTS type_utilisateur INTEGER,
      ADD COLUMN IF NOT EXISTS id_utilisateur TEXT,
      ADD COLUMN IF NOT EXISTS id_etablissement TEXT
  `)

  await pool.query(`
    UPDATE transactions t
    SET type_utilisateur = CASE
      WHEN lower(u.role) LIKE 'enseign%' THEN 2
      ELSE 1
    END,
    id_utilisateur = t.id_utilisateur
    FROM utilisateurs u
    WHERE t.id_utilisateur = u.id_utilisateur AND t.type_utilisateur IS NULL
  `)
  await pool.query(`UPDATE transactions SET type_utilisateur = 1 WHERE type_utilisateur IS NULL`)
  await pool.query(`ALTER TABLE transactions ALTER COLUMN type_utilisateur SET NOT NULL`)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE transactions ADD CONSTRAINT transactions_type_utilisateur_check
        CHECK (type_utilisateur IN (1, 2, 3));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE transactions ADD CONSTRAINT transactions_id_utilisateur_fkey
        FOREIGN KEY (id_utilisateur) REFERENCES utilisateurs(id_utilisateur) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)
  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE transactions ADD CONSTRAINT transactions_id_etablissement_fkey
        FOREIGN KEY (id_etablissement) REFERENCES etablissements(id_etablissement) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `)

  await pool.query(`UPDATE sujets SET statut = 'VALIDE' WHERE statut IN ('EN_ATTENTE', 'REJETE')`)
}

// Endpoint de crÃ©ation initiale, protÃ©gÃ© par un secret hors application.
app.post('/api/admin/create', async (req, res) => {
  const client = await pool.connect()
  try {
    const setupSecret = process.env.ADMIN_SETUP_SECRET
    if (!setupSecret || req.headers['x-admin-setup-secret'] !== setupSecret) {
      return res.status(404).json({ error: 'Ressource introuvable' })
    }
    const email = normalizeEmail(req.body.email)
    const password = normalizeText(req.body.password)
    const confirmPassword = normalizeText(req.body.confirmPassword)
    const fullName = normalizeText(req.body.fullName) || 'Admin'

    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: 'Email et mot de passe (>=6) requis' })
    }

    await client.query('BEGIN')
    const existing = await client.query(
      `SELECT id_utilisateur FROM utilisateurs WHERE lower(email) = $1 LIMIT 1`,
      [email],
    )

    if (existing.rowCount) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Un compte existe deja avec cet email' })
    }

    const hashedPassword = await hashPassword(password)
    const { prenom, nom } = splitFullName(fullName)

    await client.query(
      `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role) VALUES ($1, $2, $3, $4, $5)`,
      [nom, prenom, email, hashedPassword, 'Admin'],
    )

    await client.query('COMMIT')
    res.status(201).json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('Erreur creation admin:', error)
    res.status(500).json({ error: 'Impossible de creer le compte admin' })
  } finally {
    client.release()
  }
})

const scryptAsync = promisify(crypto.scrypt)

const initials = (name: string | null | undefined) => {
  const parts = (name || 'Utilisateur').trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'UT'
}

const schoolShort = (name: string | null | undefined) =>
  (name || 'Etablissement')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'ETB'

const formatDate = (value: Date | string | null | undefined) =>
  value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : ''

const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase()
const normalizeText = (value: unknown) => String(value || '').trim()
const normalizePhone = (value: unknown) => {
  const text = normalizeText(value)
  if (!text) return ''
  const digits = text.replace(/[^\d+]/g, '')
  return digits.startsWith('+') ? digits : digits
}
const paymentStatusMessage = (succeeded: boolean, failed: boolean) =>
  succeeded
    ? 'Paiement confirmé.'
    : failed
      ? 'Paiement refusé. Vérifiez votre numéro ou réessayez.'
      : 'Paiement en attente de confirmation.'

const collectYabisoCallbackReferences = (data: unknown) => {
  const references = new Set<string>()
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    for (const [key, nestedValue] of Object.entries(value)) {
      if (
        (typeof nestedValue === 'string' || typeof nestedValue === 'number') &&
        /^(transid|trans_id|transactionid|transaction_id|idtrans_?extern|reference|ref|id)$/i.test(key)
      ) {
        const reference = normalizeText(nestedValue)
        if (reference) references.add(reference)
      }
      visit(nestedValue)
    }
  }
  visit(data)
  return [...references]
}
const normalizeIdentifier = (value: unknown) => {
  const text = normalizeText(value)
  return text.startsWith('+') ? text : text.toLowerCase()
}

const otpStore = new Map<string, { code: string; expiresAt: number; purpose: 'register' | 'reset' }>()

const generateOtpCode = () => String(100000 + Math.floor(Math.random() * 900000))

const sendWhatsAppOtp = async (recipient: string, code: string) => {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME
  if (!accessToken || !phoneNumberId || !templateName) {
    if (process.env.NODE_ENV === 'production') throw new Error('Configuration WhatsApp manquante')
    return
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: recipient.replace(/\D/g, ''),
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'fr' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: code }] }],
      },
    }),
  })
  if (!response.ok) throw new Error(`WhatsApp a refuse l'envoi (${response.status})`)
}

const sendEmailOtp = async (recipient: string, code: string) => {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.AUTH_EMAIL_FROM
  if (!apiKey || !from) {
    throw new Error('Configuration email manquante (RESEND_API_KEY, AUTH_EMAIL_FROM)')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: 'Code de réinitialisation de votre mot de passe',
      text: `Votre code de vérification EduConnect Congo est : ${code}. Il expire dans 10 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`,
    }),
  })
  if (!response.ok) throw new Error(`Le service email a refuse l'envoi (${response.status})`)
}

const storeOtp = (key: string, purpose: 'register' | 'reset') => {
  const code = generateOtpCode()
  otpStore.set(key, {
    code,
    expiresAt: Date.now() + 10 * 60 * 1000,
    purpose,
  })
  return code
}

const verifyOtp = (key: string, otp: string, purpose: 'register' | 'reset') => {
  const entry = otpStore.get(key)
  if (!entry || entry.purpose !== purpose) return false
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key)
    return false
  }
  const valid = entry.code === normalizeText(otp)
  if (valid) otpStore.delete(key)
  return valid
}

const hashPassword = async (password: string) => {
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer
  return `scrypt:${salt}:${derivedKey.toString('hex')}`
}

const verifyPassword = async (password: string, storedPassword: string) => {
  if (!storedPassword) return false
  if (!storedPassword.startsWith('scrypt:')) {
    return password === storedPassword
  }

  const [, salt, storedKey] = storedPassword.split(':')
  if (!salt || !storedKey) return false

  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer
  const storedBuffer = Buffer.from(storedKey, 'hex')
  return storedBuffer.length === derivedKey.length && crypto.timingSafeEqual(storedBuffer, derivedKey)
}

const splitFullName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { prenom: 'Utilisateur', nom: 'EduConnect' }
  if (parts.length === 1) return { prenom: parts[0], nom: parts[0] }
  return { prenom: parts[0], nom: parts.slice(1).join(' ') }
}

const toAppRole = (dbRole: string): UserRole | 'admin' => {
  const role = dbRole.toLowerCase()
  if (role.includes('admin')) return 'admin'
  if (role.includes('enseign')) return 'teacher'
  return 'student'
}

const authUserResponse = (user: any, role: UserRole) => ({
  id: user.id_utilisateur || user.id_etablissement,
  role,
  name: [user.prenom, user.nom].filter(Boolean).join(' ') || user.nom_etablissement,
  email: user.email || user.email_officiel,
  phone: user.telephone || user.telephone_contact || '',
  verified: typeof user.est_verifie !== 'undefined' ? Boolean(user.est_verifie) : undefined,
})

const mapDocument = (row: any) => {
  const teacherName = [row.prenom, row.nom].filter(Boolean).join(' ') || 'Enseignant'
  const schoolName = row.nom_etablissement || 'Enseignant independant'

  return {
    id: row.id_sujet,
    title: row.titre,
    description: row.description || '',
    type: row.type_document || '',
    subject: row.nom_matiere,
    level: row.nom_classe,
    reference: row.reference_sujet || '',
    year: row.date_televersement ? new Date(row.date_televersement).getFullYear().toString() : '',
    price: Number(row.prix || 0),
    downloads: Number(row.downloads || 0),
    teacher: {
      id: row.id_enseignant || row.id_utilisateur || '',
      name: teacherName,
      initials: initials(teacherName),
      avatar: row.photo_url || '',
      bio: row.biographie || '',
    },
    school: { name: schoolName, short: schoolShort(schoolName), color: '#16A34A' },
    date: formatDate(row.date_televersement),
    tags: [row.type_document, row.statut].filter(Boolean),
    status: row.statut,
    reason: row.motif_refus || '',
    fileUrl: row.id_sujet ? `/api/documents/${row.id_sujet}/download` : '',
    period: row.periode || '',
  }
}

app.get('/api/documents/:documentId/download', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as SessionUser
    const documentId = normalizeText(req.params.documentId)
    if (!documentId) return res.status(400).json({ error: 'Document requis' })

    const documentResult = await pool.query(
      `SELECT d.id_sujet, d.titre, d.url_fichier
       FROM sujets d
       WHERE d.id_sujet = $1 AND d.statut = 'VALIDE'
       LIMIT 1`,
      [documentId],
    )
    if (!documentResult.rowCount) return res.status(404).json({ error: 'Document introuvable' })

    let hasAccess = false
    if (auth.role === 'school') {
      const accessResult = await pool.query(
        `SELECT 1 FROM abonnements
         WHERE id_etablissement = $1 AND statut = 'ACTIVE' AND date_fin > NOW()
         LIMIT 1`,
        [auth.id],
      )
      hasAccess = Boolean(accessResult.rowCount)
    } else {
      const accessResult = await pool.query(
        `SELECT t.ref_externe, t.ref_interne
         FROM paiements p
         JOIN transactions t ON t.id_sujet = p.id_sujet
           AND t.id_utilisateur = p.id_utilisateur
           AND (t.ref_externe = p.reference OR t.ref_interne = p.reference)
         WHERE p.id_utilisateur = $1 AND p.id_sujet = $2
           AND t.statut_paiement IN ('SUCCESS', '200')
         LIMIT 1`,
        [auth.id, documentId],
      )
      if (accessResult.rowCount) {
        const references = [...new Set([accessResult.rows[0].ref_externe, accessResult.rows[0].ref_interne].filter(Boolean))]
        for (const reference of references) {
          try {
            const providerStatus = await getYabisoStatus(reference)
            if (isSuccessfulYabisoStatus(providerStatus)) {
              hasAccess = true
              break
            }
          } catch (error) {
            console.warn(`[YabisoPay] VÃ©rification avant tÃ©lÃ©chargement impossible (${reference}):`, error)
          }
        }
      }
    }

    if (!hasAccess) return res.status(403).json({ error: 'Paiement requis pour tÃ©lÃ©charger ce document' })

    const storedPath = normalizeText(documentResult.rows[0].url_fichier)
    const filePath = resolveUploadPath(storedPath)
    if (!storedPath || !filePath.startsWith(`${uploadDirectory}${path.sep}`) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier du document introuvable' })
    }

    return res.download(filePath, `${documentResult.rows[0].titre || 'document'}.pdf`, error => {
      if (error && !res.headersSent) res.status(404).json({ error: 'Fichier du document introuvable' })
    })
  } catch (error) {
    console.error('Erreur tÃ©lÃ©chargement document:', error)
    return res.status(500).json({ error: 'Impossible de tÃ©lÃ©charger le document' })
  }
})

app.post('/api/auth/register', async (req, res) => {
  const client = await pool.connect()

  try {
    const role = normalizeText(req.body.role) as UserRole
    const password = normalizeText(req.body.password)
    const confirmPassword = normalizeText(req.body.confirmPassword)
    const phone = normalizePhone(req.body.phone)
    const normalizedPhone = phone.replace(/\s+/g, '')
    let email = normalizeEmail(req.body.email)

    if (!['student', 'teacher', 'school'].includes(role)) {
      return res.status(400).json({ error: 'Type de compte invalide' })
    }

    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Le numero de telephone est requis pour lâ€™inscription' })
    }

    if (!email && normalizedPhone) {
      email = `${normalizedPhone.replace(/[^\d]/g, '')}@phone.educonnect.cg`
    }

    if (!email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Email et mot de passe requis' })
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Les deux mots de passe doivent Ãªtre identiques' })
    }

    if (role === 'school') {
      const schoolName = normalizeText(req.body.schoolName)
      const city = normalizeText(req.body.city) || 'Brazzaville'

      if (!schoolName) {
       return res.status(400).json({ error: "Nom de l'etablissement requis" })
      }

      await client.query('BEGIN')
      const hashedPassword = await hashPassword(password)

      const result = await client.query(
       `INSERT INTO etablissements
        (nom_etablissement, email_officiel, mot_de_passe, telephone_contact, ville, est_verifie)
        VALUES ($1, $2, $3, $4, $5, true)
        RETURNING id_etablissement, nom_etablissement, email_officiel, est_verifie`,
             [schoolName, email || `ecole-${Date.now()}@educonnect.cg`, hashedPassword, normalizedPhone || null, city],
      )

      await client.query('COMMIT')
      const user = authUserResponse(result.rows[0], 'school')
      await setSession(res, { id: user.id, role: 'school' })
      return res.status(201).json({ user })
    }

    await client.query('BEGIN')
    const hashedPassword = await hashPassword(password)

    const fullName = normalizeText(req.body.fullName)
    const { prenom, nom } = splitFullName(fullName)
    const dbRole = role === 'teacher' ? 'Enseignant' : 'Grand public'
    const schoolIds = Array.isArray(req.body.schoolIds)
      ? req.body.schoolIds.map((value: unknown) => normalizeText(value)).filter(Boolean)
      : normalizeText(req.body.schoolId) ? [normalizeText(req.body.schoolId)] : []
    const schoolId = schoolIds[0] || null

    const userResult = role === 'teacher'
      ? await client.query(
        `INSERT INTO utilisateurs (id_utilisateur, nom, prenom, email, mot_de_passe, role, id_etablissement, telephone)
         VALUES ('ENS' || lpad(nextval('enseignants_id_seq')::text, 9, '0'), $1, $2, $3, $4, $5, $6, $7)
         RETURNING id_utilisateur, nom, prenom, email, role, telephone`,
        [nom, prenom, email, hashedPassword, dbRole, schoolId, normalizedPhone],
      )
      : await client.query(
        `INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role, id_etablissement, telephone)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id_utilisateur, nom, prenom, email, role, telephone`,
        [nom, prenom, email, hashedPassword, dbRole, schoolId, normalizedPhone],
      )

    if (role === 'teacher') {
      await client.query(
       `INSERT INTO profils_enseignants (id_utilisateur, cycle, matiere_principale, telephone, statut_approbation)
         VALUES ($1, $2, $3, $4, 'VALIDE')`,
       [
         userResult.rows[0].id_utilisateur,
         normalizeText(req.body.cycle) || 'CollÃ¨ge',
         normalizeText(req.body.mainSubject) || 'Non renseignÃ©e',
         normalizedPhone,
       ],
      )
      if (schoolIds.length > 0) {
        const existingSchools = await client.query(
          `SELECT id_etablissement FROM etablissements WHERE id_etablissement = ANY($1::text[])`,
          [schoolIds],
        )
        if (existingSchools.rowCount !== schoolIds.length) {
          await client.query('ROLLBACK')
          return res.status(400).json({ error: 'Une ou plusieurs Ã©coles sont invalides' })
        }
        for (const selectedSchoolId of schoolIds) {
          await client.query(
            `INSERT INTO enseignant_etablissements (id_enseignant, id_etablissement, statut_approbation)
             VALUES ($1, $2, 'VALIDE') ON CONFLICT (id_enseignant, id_etablissement)
             DO UPDATE SET statut_approbation = 'VALIDE'`,
            [userResult.rows[0].id_utilisateur, selectedSchoolId],
          )
        }
      }
    }

    await client.query('COMMIT')
    const user = authUserResponse(userResult.rows[0], role)
    await setSession(res, { id: user.id, role, schoolId: userResult.rows[0].id_etablissement })
    return res.status(201).json({ user })
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('Erreur inscription:', error)
    if (error?.code === '23505') {
      return res.status(409).json({ error: 'Un compte existe deja avec cet email, cet agrement ou ces informations' })
    }
    return res.status(500).json({ error: "Impossible de creer le compte dans la base de donnees" })
  } finally {
    client.release()
  }
})

app.post('/api/auth/login', async (req, res) => {
  try {
    const identifier = normalizeText(req.body.identifier)
    const identifierEmail = normalizeEmail(identifier)
    const identifierPhone = identifier.replace(/\s+/g, '')
    const password = normalizeText(req.body.password)

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Email ou telephone et mot de passe requis' })
    }

    const schoolResult = await pool.query(
      `SELECT id_etablissement, nom_etablissement, email_officiel, telephone_contact, mot_de_passe, est_verifie
       FROM etablissements
       WHERE lower(email_officiel) = $1
          OR regexp_replace(COALESCE(telephone_contact, ''), '\\s+', '', 'g') = $2
       LIMIT 1`,
      [identifierEmail, identifierPhone],
    )

    if (schoolResult.rowCount && await verifyPassword(password, schoolResult.rows[0].mot_de_passe)) {
      const user = authUserResponse(schoolResult.rows[0], 'school')
      await setSession(res, { id: user.id, role: 'school' })
      return res.json({ user })
    }

    const userResult = await pool.query(
      `SELECT id_utilisateur, nom, prenom, email, telephone, mot_de_passe, role
       FROM utilisateurs
       WHERE lower(email) = $1
          OR regexp_replace(COALESCE(telephone, ''), '\\s+', '', 'g') = $2
       LIMIT 1`,
      [identifierEmail, identifierPhone],
    )

    if (userResult.rowCount && await verifyPassword(password, userResult.rows[0].mot_de_passe)) {
      const role = toAppRole(userResult.rows[0].role)
      const user = authUserResponse(userResult.rows[0], role)
      await setSession(res, { id: user.id, role, schoolId: userResult.rows[0].id_etablissement })
      return res.json({ user })
    }

    return res.status(401).json({ error: 'Identifiants incorrects' })
  } catch (error) {
    console.error('Erreur connexion:', error)
    return res.status(500).json({ error: 'Impossible de verifier les identifiants' })
  }
})

app.post('/api/auth/request-otp', async (req, res) => {
  try {
    const purpose = normalizeText(req.body.purpose) === 'reset' ? 'reset' : 'register'
    const rawTarget = normalizeText(req.body.phone || req.body.email || req.body.identifier)
    const isEmail = rawTarget.includes('@')
    const phone = isEmail ? '' : normalizePhone(rawTarget)
    const email = isEmail ? normalizeEmail(rawTarget) : ''
    const target = phone || email

    if (!target) {
      return res.status(400).json({ error: 'Le numero de telephone ou lâ€™email est requis' })
    }

    if (purpose === 'register' && phone) {
      const existingUser = await pool.query(
        `SELECT id_utilisateur FROM utilisateurs WHERE regexp_replace(COALESCE(telephone, ''), '\\s+', '', 'g') = $1 LIMIT 1`,
        [phone],
      )
      const existingSchool = await pool.query(
        `SELECT id_etablissement FROM etablissements WHERE regexp_replace(COALESCE(telephone_contact, ''), '\\s+', '', 'g') = $1 LIMIT 1`,
        [phone],
      )

      if (existingUser.rowCount || existingSchool.rowCount) {
        return res.status(409).json({ error: 'Ce numero de telephone est deja utilise' })
      }
    }

    const code = generateOtpCode()

    if (purpose === 'reset') {
      if (email) await sendEmailOtp(email, code)
      else await sendWhatsAppOtp(phone, code)
    }

    otpStore.set(target, { code, expiresAt: Date.now() + 10 * 60 * 1000, purpose })
    if (process.env.NODE_ENV !== 'production') console.log(`OTP ${purpose} pour`, target, code)

    if (process.env.NODE_ENV !== 'production') {
      return res.json({ ok: true, devCode: code })
    }

    return res.json({ ok: true })
  } catch (error) {
    console.error('Erreur request-otp:', error)
    return res.status(500).json({ error: 'Impossible dâ€™envoyer le code de verification' })
  }
})

// Start forgot-password flow: generate a short token and save it
app.post('/api/auth/forgot', async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone || req.body.identifier)
    const email = normalizeEmail(req.body.email || req.body.identifier)
    const target = phone || email

    if (!target) return res.status(400).json({ error: 'Telephone ou email requis' })

    const [userResult, schoolResult] = await Promise.all([
      phone
        ? pool.query("SELECT id_utilisateur FROM utilisateurs WHERE regexp_replace(COALESCE(telephone, ''), '\\s+', '', 'g') = $1 LIMIT 1", [phone])
        : pool.query('SELECT email FROM utilisateurs WHERE lower(email) = $1 LIMIT 1', [email]),
      phone
        ? pool.query("SELECT id_etablissement FROM etablissements WHERE regexp_replace(COALESCE(telephone_contact, ''), '\\s+', '', 'g') = $1 LIMIT 1", [phone])
        : pool.query('SELECT email_officiel FROM etablissements WHERE lower(email_officiel) = $1 LIMIT 1', [email]),
    ])

    if (!userResult.rowCount && !schoolResult.rowCount) {
      return res.json({ ok: true })
    }

    const code = storeOtp(target, 'reset')
    console.log('Password reset OTP for', target, code)

    if (process.env.NODE_ENV !== 'production') {
      return res.json({ ok: true, devCode: code })
    }

    return res.json({ ok: true })
  } catch (error) {
    console.error('Erreur forgot-password:', error)
    return res.status(500).json({ error: 'Impossible de demarrer la reinitialisation' })
  }
})

// Complete password reset using token
app.post('/api/auth/reset', async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone || req.body.identifier)
    const email = normalizeEmail(req.body.email || req.body.identifier)
    const otp = normalizeText(req.body.otp || req.body.token)
    const password = normalizeText(req.body.password)
    const contact = phone || email

    if (!contact || !otp || !password) {
      return res.status(400).json({ error: 'Telephone ou email, code et mot de passe requis' })
    }

    const target = phone || email
    if (!verifyOtp(target, otp, 'reset')) {
      return res.status(400).json({ error: 'Code de verification invalide ou expire' })
    }

    const hashed = await hashPassword(password)

    const [schoolResult, userResult] = await Promise.all([
      phone
        ? pool.query("SELECT id_etablissement, email_officiel FROM etablissements WHERE regexp_replace(COALESCE(telephone_contact, ''), '\\s+', '', 'g') = $1 LIMIT 1", [phone])
        : pool.query('SELECT id_etablissement, email_officiel FROM etablissements WHERE lower(email_officiel) = $1 LIMIT 1', [email]),
      phone
        ? pool.query("SELECT id_utilisateur, email FROM utilisateurs WHERE regexp_replace(COALESCE(telephone, ''), '\\s+', '', 'g') = $1 LIMIT 1", [phone])
        : pool.query('SELECT id_utilisateur, email FROM utilisateurs WHERE lower(email) = $1 LIMIT 1', [email]),
    ])

    if (schoolResult.rowCount) {
      await pool.query('UPDATE etablissements SET mot_de_passe = $1 WHERE id_etablissement = $2', [hashed, schoolResult.rows[0].id_etablissement])
    }

    if (userResult.rowCount) {
      await pool.query('UPDATE utilisateurs SET mot_de_passe = $1 WHERE id_utilisateur = $2', [hashed, userResult.rows[0].id_utilisateur])
    }

    return res.json({ ok: true })
  } catch (error) {
    console.error('Erreur reset-password:', error)
    return res.status(500).json({ error: 'Impossible de reinitialiser le mot de passe' })
  }
})

app.post('/api/auth/logout', async (req, res) => {
  const token = parseCookies(req.headers.cookie).educonnect_session
  if (token) await pool.query('DELETE FROM auth_sessions WHERE token = $1', [token])
  res.setHeader('Set-Cookie', 'educonnect_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax')
  res.json({ ok: true })
})

app.use('/api/admin', requireAuth, requireRole('admin'))
app.use('/api/student', requireAuth, requireRole('student', 'teacher'))
app.use('/api/school', requireAuth, requireRole('school'))

// Admin: list all schools (etablissements)
app.get('/api/admin/schools', async (req, res) => {
  try {
    const result = await pool.query(`SELECT id_etablissement, nom_etablissement, numero_agrement, email_officiel, ville, est_verifie, date_creation FROM etablissements ORDER BY date_creation DESC`)
    res.json({ schools: result.rows })
  } catch (error) {
    console.error('Erreur admin schools:', error)
    res.status(500).json({ error: "Impossible de charger la liste des etablissements" })
  }
})

app.get('/api/initial-data', async (req, res) => {
  try {
    const [classesResult, matieresResult] = await Promise.all([
      pool.query('SELECT * FROM niveaux ORDER BY nom_classe'),
      pool.query('SELECT * FROM matieres ORDER BY nom_matiere'),
    ])

    res.json({
      classes: classesResult.rows,
      matieres: matieresResult.rows,
    })
  } catch (error) {
    console.error('Erreur initial-data:', error)
    res.status(500).json({ error: 'Impossible de lire la base de donnees sujet' })
  }
})

// Admin: Niveaux (classes) CRUD
app.get('/api/admin/niveaux', async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT c.id_classe, c.nom_classe, c.cycle, COUNT(cm.id_matiere) AS matieres_count
      FROM niveaux c
      LEFT JOIN classes_matieres cm ON cm.id_classe = c.id_classe
      GROUP BY c.id_classe
      ORDER BY c.nom_classe
    `)
    res.json({ niveaux: q.rows })
  } catch (e) {
    console.error('Erreur GET niveaux', e)
    res.status(500).json({ error: 'Impossible de charger les niveaux' })
  }
})

app.post('/api/admin/niveaux', async (req, res) => {
  try {
    const nom = normalizeText(req.body.nom_classe || req.body.nom)
    const cycle = normalizeText(req.body.cycle || 'CollÃ¨ge')
    if (!nom) return res.status(400).json({ error: 'Nom du niveau requis' })

    const existing = await pool.query('SELECT id_classe FROM niveaux WHERE lower(nom_classe) = $1 LIMIT 1', [nom.toLowerCase()])
    if (existing.rowCount) return res.status(409).json({ error: 'Niveau existe deja' })

    await pool.query('INSERT INTO niveaux (id_classe, nom_classe, cycle) VALUES ($1, $2, $3)', [String(Date.now()), nom, cycle])
    res.status(201).json({ ok: true })
  } catch (e) {
    console.error('Erreur create niveau', e)
    res.status(500).json({ error: 'Impossible de creer le niveau' })
  }
})

app.get('/api/admin/niveaux/:id', async (req, res) => {
  try {
    const id = normalizeText(req.params.id)
    const q = await pool.query('SELECT id_classe, nom_classe, cycle FROM niveaux WHERE id_classe = $1 LIMIT 1', [id])
    if (!q.rowCount) return res.status(404).json({ error: 'Niveau introuvable' })
    res.json({ niveau: q.rows[0] })
  } catch (e) {
    console.error('Erreur get niveau', e)
    res.status(500).json({ error: 'Impossible de charger le niveau' })
  }
})

app.put('/api/admin/niveaux/:id', async (req, res) => {
  try {
    const id = normalizeText(req.params.id)
    const nom = normalizeText(req.body.nom_classe || req.body.nom)
    const cycle = normalizeText(req.body.cycle || 'CollÃ¨ge')
    if (!nom) return res.status(400).json({ error: 'Nom du niveau requis' })

    const other = await pool.query('SELECT id_classe FROM niveaux WHERE lower(nom_classe) = $1 AND id_classe <> $2 LIMIT 1', [nom.toLowerCase(), id])
    if (other.rowCount) return res.status(409).json({ error: 'Un autre niveau existe deja avec ce nom' })

    const r = await pool.query('UPDATE niveaux SET nom_classe = $1, cycle = $2 WHERE id_classe = $3', [nom, cycle, id])
    res.json({ ok: true })
  } catch (e) {
    console.error('Erreur update niveau', e)
    res.status(500).json({ error: 'Impossible de modifier le niveau' })
  }
})

app.delete('/api/admin/niveaux/:id', async (req, res) => {
  try {
    const id = normalizeText(req.params.id)
    // prevent deletion if documents exist for this class
    const docs = await pool.query('SELECT COUNT(*) AS cnt FROM sujets WHERE id_classe = $1', [id])
    if (Number(docs.rows[0].cnt || 0) > 0) return res.status(400).json({ error: 'Impossible de supprimer: des documents sont attaches Ã  ce niveau' })

    await pool.query('BEGIN')
    await pool.query('DELETE FROM classes_matieres WHERE id_classe = $1', [id])
    await pool.query('DELETE FROM niveaux WHERE id_classe = $1', [id])
    await pool.query('COMMIT')
    res.json({ ok: true })
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => undefined)
    console.error('Erreur delete niveau', e)
    res.status(500).json({ error: 'Impossible de supprimer le niveau' })
  }
})

// Admin: Matieres CRUD
app.get('/api/admin/matieres', async (req, res) => {
  try {
    const q = await pool.query(`
      SELECT m.id_matiere, m.nom_matiere, array_remove(array_agg(c.nom_classe ORDER BY c.nom_classe), NULL) AS classes
      FROM matieres m
      LEFT JOIN classes_matieres cm ON cm.id_matiere = m.id_matiere
      LEFT JOIN niveaux c ON c.id_classe = cm.id_classe
      GROUP BY m.id_matiere
      ORDER BY m.nom_matiere
    `)
    res.json({ matieres: q.rows })
  } catch (e) {
    console.error('Erreur GET matieres', e)
    res.status(500).json({ error: 'Impossible de charger les matieres' })
  }
})

app.post('/api/admin/matieres', async (req, res) => {
  try {
    const nom = normalizeText(req.body.nom_matiere || req.body.nom)
    if (!nom) return res.status(400).json({ error: 'Nom de la matiere requis' })

    const existing = await pool.query('SELECT id_matiere FROM matieres WHERE lower(nom_matiere) = $1 LIMIT 1', [nom.toLowerCase()])
    if (existing.rowCount) return res.status(409).json({ error: 'Matiere existe deja' })

    await pool.query('INSERT INTO matieres (id_matiere, nom_matiere) VALUES ($1, $2)', [String(Date.now()), nom])
    res.status(201).json({ ok: true })
  } catch (e) {
    console.error('Erreur create matiere', e)
    res.status(500).json({ error: 'Impossible de creer la matiere' })
  }
})

app.get('/api/admin/matieres/:id', async (req, res) => {
  try {
    const id = normalizeText(req.params.id)
    const q = await pool.query('SELECT id_matiere, nom_matiere FROM matieres WHERE id_matiere = $1 LIMIT 1', [id])
    if (!q.rowCount) return res.status(404).json({ error: 'Matiere introuvable' })
    const classesQ = await pool.query('SELECT c.id_classe, c.nom_classe FROM niveaux c JOIN classes_matieres cm ON cm.id_classe = c.id_classe WHERE cm.id_matiere = $1', [id])
    res.json({ matiere: q.rows[0], classes: classesQ.rows })
  } catch (e) {
    console.error('Erreur get matiere', e)
    res.status(500).json({ error: 'Impossible de charger la matiere' })
  }
})

app.put('/api/admin/matieres/:id', async (req, res) => {
  try {
    const id = normalizeText(req.params.id)
    const nom = normalizeText(req.body.nom_matiere || req.body.nom)
    if (!nom) return res.status(400).json({ error: 'Nom de la matiere requis' })

    const other = await pool.query('SELECT id_matiere FROM matieres WHERE lower(nom_matiere) = $1 AND id_matiere <> $2 LIMIT 1', [nom.toLowerCase(), id])
    if (other.rowCount) return res.status(409).json({ error: 'Une autre matiere existe deja avec ce nom' })

    await pool.query('UPDATE matieres SET nom_matiere = $1 WHERE id_matiere = $2', [nom, id])
    res.json({ ok: true })
  } catch (e) {
    console.error('Erreur update matiere', e)
    res.status(500).json({ error: 'Impossible de modifier la matiere' })
  }
})

app.delete('/api/admin/matieres/:id', async (req, res) => {
  try {
    const id = normalizeText(req.params.id)
    const docs = await pool.query('SELECT COUNT(*) AS cnt FROM sujets WHERE id_matiere = $1', [id])
    if (Number(docs.rows[0].cnt || 0) > 0) return res.status(400).json({ error: 'Impossible de supprimer: des documents sont attaches a cette matiere' })

    await pool.query('BEGIN')
    await pool.query('DELETE FROM classes_matieres WHERE id_matiere = $1', [id])
    await pool.query('DELETE FROM matieres WHERE id_matiere = $1', [id])
    await pool.query('COMMIT')
    res.json({ ok: true })
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => undefined)
    console.error('Erreur delete matiere', e)
    res.status(500).json({ error: 'Impossible de supprimer la matiere' })
  }
})

// Relations: list matieres for a niveau and sync
app.get('/api/admin/niveaux/:id/matieres', async (req, res) => {
  try {
    const id = normalizeText(req.params.id)
    const allMatieres = await pool.query('SELECT id_matiere, nom_matiere FROM matieres ORDER BY nom_matiere')
    const bound = await pool.query('SELECT id_matiere FROM classes_matieres WHERE id_classe = $1', [id])
    const boundIds = new Set(bound.rows.map((r: any) => r.id_matiere))
    res.json({ matieres: allMatieres.rows, selectedIds: Array.from(boundIds) })
  } catch (e) {
    console.error('Erreur GET niveau matieres', e)
    res.status(500).json({ error: 'Impossible de charger les matieres du niveau' })
  }
})

app.put('/api/admin/niveaux/:id/matieres', async (req, res) => {
  const client = await pool.connect()
  try {
    const id = normalizeText(req.params.id)
    const matiereIds = Array.isArray(req.body.matiereIds) ? req.body.matiereIds.map((x: any) => String(x)) : []

    // validate niveau exists
    const niveau = await client.query('SELECT id_classe FROM niveaux WHERE id_classe = $1 LIMIT 1', [id])
    if (!niveau.rowCount) return res.status(404).json({ error: 'Niveau introuvable' })

    // validate matieres exist
    if (matiereIds.length > 0) {
      const placeholders = matiereIds.map((_matiereId: string, index: number) => `$${index + 1}`).join(',')
      const q = await client.query(`SELECT id_matiere FROM matieres WHERE id_matiere IN (${placeholders})`, matiereIds)
      if (q.rowCount !== matiereIds.length) return res.status(400).json({ error: 'Une ou plusieurs matieres invalides' })
    }

    await client.query('BEGIN')
    // delete ones not in new list
    await client.query(`DELETE FROM classes_matieres WHERE id_classe = $1 AND id_matiere NOT IN (${matiereIds.length ? matiereIds.map((_matiereId: string, index: number) => `$${index + 2}`).join(',') : 'NULL'})`, [id, ...matiereIds])

    // insert new ones (ignore duplicates)
    for (const mid of matiereIds) {
      await client.query(`INSERT INTO classes_matieres (id_classe, id_matiere) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [id, mid])
    }

    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('Erreur PUT niveau matieres', e)
    res.status(500).json({ error: 'Impossible de synchroniser les matieres du niveau' })
  } finally {
    client.release()
  }
})

// Sync classes for a matiere
app.put('/api/admin/matieres/:id/classes', async (req, res) => {
  const client = await pool.connect()
  try {
    const id = normalizeText(req.params.id)
    const classIds = Array.isArray(req.body.classIds) ? req.body.classIds.map((x: any) => String(x)) : []

    const mat = await client.query('SELECT id_matiere FROM matieres WHERE id_matiere = $1 LIMIT 1', [id])
    if (!mat.rowCount) return res.status(404).json({ error: 'Matiere introuvable' })

    if (classIds.length > 0) {
      const placeholders = classIds.map((_classId: string, index: number) => `$${index + 1}`).join(',')
      const q = await client.query(`SELECT id_classe FROM niveaux WHERE id_classe IN (${placeholders})`, classIds)
      if (q.rowCount !== classIds.length) return res.status(400).json({ error: 'Une ou plusieurs classes invalides' })
    }

    await client.query('BEGIN')
    await client.query(`DELETE FROM classes_matieres WHERE id_matiere = $1 AND id_classe NOT IN (${classIds.length ? classIds.map((_classId: string, index: number) => `$${index + 2}`).join(',') : 'NULL'})`, [id, ...classIds])
    for (const cid of classIds) {
      await client.query('INSERT INTO classes_matieres (id_classe, id_matiere) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cid, id])
    }
    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('Erreur PUT matiere classes', e)
    res.status(500).json({ error: 'Impossible de synchroniser les classes de la matiere' })
  } finally {
    client.release()
  }
})
app.get('/api/catalog', async (req, res) => {
  try {
    const [classesResult, matieresResult, schoolsResult, documentsResult, statsResult] = await Promise.all([
      pool.query('SELECT id_classe, nom_classe, cycle, code_classe FROM niveaux ORDER BY nom_classe'),
      pool.query('SELECT id_matiere, nom_matiere, code_matiere FROM matieres ORDER BY nom_matiere'),
      pool.query('SELECT id_etablissement, nom_etablissement FROM etablissements WHERE est_verifie = true ORDER BY nom_etablissement'),
      pool.query(`
        SELECT d.*, c.nom_classe, m.nom_matiere, u.nom, u.prenom, u.id_utilisateur AS id_enseignant,
               e.nom_etablissement, p.photo_url, p.biographie,
               COUNT(t.id_transaction) FILTER (WHERE t.statut_paiement IN ('SUCCESS', '200')) AS downloads
        FROM sujets d
        JOIN niveaux c ON c.id_classe = d.id_classe
        JOIN matieres m ON m.id_matiere = d.id_matiere
        JOIN utilisateurs u ON u.id_utilisateur = d.id_enseignant
        LEFT JOIN profils_enseignants p ON p.id_utilisateur = u.id_utilisateur
        LEFT JOIN etablissements e ON e.id_etablissement = d.id_etablissement
        LEFT JOIN transactions t ON t.id_sujet = d.id_sujet
        WHERE d.statut = 'VALIDE'
        GROUP BY d.id_sujet, c.nom_classe, m.nom_matiere, u.nom, u.prenom, u.id_utilisateur, e.nom_etablissement, p.photo_url, p.biographie
        ORDER BY d.date_televersement DESC
      `),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM transactions WHERE statut_paiement IN ('SUCCESS', '200')) AS downloads,
          (SELECT COUNT(*) FROM profils_enseignants WHERE statut_approbation = 'VALIDE') AS teachers,
          (SELECT COUNT(*) FROM etablissements WHERE est_verifie = true) AS schools,
          (SELECT COUNT(*) FROM utilisateurs) AS users
      `),
    ])

    res.json({
      classes: classesResult.rows,
      subjects: matieresResult.rows,
      schools: schoolsResult.rows,
      papers: documentsResult.rows.map(mapDocument),
      stats: {
        downloads: Number(statsResult.rows[0].downloads || 0),
        teachers: Number(statsResult.rows[0].teachers || 0),
        schools: Number(statsResult.rows[0].schools || 0),
        users: Number(statsResult.rows[0].users || 0),
      },
    })
  } catch (error) {
    console.error('Erreur catalogue:', error)
    res.status(500).json({ error: 'Impossible de charger le catalogue depuis la base de donnees' })
  }
})

app.get('/api/student/dashboard', async (req, res) => {
  try {
    const userId = normalizeText(req.query.userId)
    if (!userId) {
      return res.status(400).json({ error: 'Utilisateur eleve requis' })
    }
    if (!requireOwner(req, res, userId)) return

    const repairClient = await pool.connect()
    try {
      await repairClient.query('BEGIN')
      // DÃ‰SACTIVÃ‰: VÃ©rification automatique des transactions PENDING en arriÃ¨re-plan
      // Cette vÃ©rification se fait maintenant uniquement via POST /api/payments/check-status
      // const pendingTransactions = await repairClient.query(
      //   `SELECT t.*, u.role AS user_role
      //    FROM transactions t
      //    LEFT JOIN utilisateurs u ON u.id_utilisateur = t.id_utilisateur
      //    WHERE t.id_utilisateur = $1 AND t.statut_paiement = 'PENDING'
      //    FOR UPDATE OF t`,
      //   [userId],
      // )
      // for (const transaction of pendingTransactions.rows) {
      //   const references = [...new Set([transaction.ref_externe, transaction.ref_interne].filter(Boolean))]
      //   for (const reference of references) {
      //     try {
      //       const providerStatus = await getYabisoStatus(reference)
      //       if (isSuccessfulYabisoStatus(providerStatus)) {
      //         await repairClient.query(`UPDATE transactions SET statut_paiement = 'SUCCESS', ref_operateur = $1 WHERE id_transaction = $2`, [providerStatus.IDTrans_Extern || null, transaction.id_transaction])
      //         transaction.statut_paiement = 'SUCCESS'
      //         await finalizeSuccessfulTransaction(repairClient, transaction)
      //         break
      //       }
      //     } catch (error) {
      //       console.warn('RÃ©conciliation YabisoPay temporairement indisponible:', error)
      //     }
      //   }
      // }
      // DÃ‰SACTIVÃ‰: VÃ©rification des transactions SUCCESS sans paiement enregistrÃ©
      // const successfulTransactions = await repairClient.query(
      //   `SELECT t.*, u.role AS user_role
      //    FROM transactions t
      //    LEFT JOIN utilisateurs u ON u.id_utilisateur = t.id_utilisateur
      //    WHERE t.id_utilisateur = $1
      //      AND t.statut_paiement = 'SUCCESS'
      //      AND NOT EXISTS (
      //        SELECT 1 FROM paiements p
      //        WHERE p.reference = COALESCE(t.ref_externe, t.ref_interne)
      //      )
      //    FOR UPDATE OF t`,
      //   [userId],
      // )
      // for (const transaction of successfulTransactions.rows) {
      //   await finalizeSuccessfulTransaction(repairClient, transaction)
      // }
      await repairClient.query('COMMIT')
    } catch (error) {
      await repairClient.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      repairClient.release()
    }

    const purchasesResult = await pool.query(
      `SELECT DISTINCT p.id_sujet
       FROM paiements p
       WHERE p.id_utilisateur = $1`,
      [userId],
    )

    const historyResult = await pool.query(
      `SELECT p.id_paiement, p.id_sujet, p.numero_achat, p.reference, p.montant, p.date_paiement,
              d.reference_sujet,
              d.titre, c.nom_classe, m.nom_matiere
       FROM paiements p
       JOIN sujets d ON d.id_sujet = p.id_sujet
      JOIN niveaux c ON c.id_classe = d.id_classe
       JOIN matieres m ON m.id_matiere = d.id_matiere
       WHERE p.id_utilisateur = $1
       ORDER BY p.date_paiement DESC`,
      [userId],
    )

    res.json({
      purchasedIds: purchasesResult.rows.map(row => row.id_sujet),
      purchases: historyResult.rows.map(row => ({
        id: row.id_paiement,
        paperId: row.id_sujet,
        title: row.titre,
        subject: row.nom_matiere,
        level: row.nom_classe,
        amount: Number(row.montant || 0),
        date: formatDate(row.date_paiement),
        purchaseNumber: row.numero_achat,
        reference: row.reference,
        subjectReference: row.reference_sujet,
      })),
    })
  } catch (error) {
    console.error('Erreur dashboard eleve:', error)
    res.status(500).json({ error: "Impossible de charger l'espace eleve" })
  }
})

app.get('/api/student/profile', async (req, res) => {
  try {
    const studentId = normalizeText(req.query.studentId)
    if (!studentId) {
      return res.status(400).json({ error: 'Utilisateur eleve requis' })
    }
    if (!requireOwner(req, res, studentId)) return

    const [studentResult, purchasesResult] = await Promise.all([
      pool.query(
        `SELECT u.id_utilisateur, u.nom, u.prenom, u.email, u.id_etablissement,
                e.nom_etablissement, e.ville, e.telephone_contact
         FROM utilisateurs u
         LEFT JOIN etablissements e ON u.id_etablissement = e.id_etablissement
         WHERE u.id_utilisateur = $1 AND lower(u.role) = 'eleve'
         LIMIT 1`,
        [studentId],
      ),
      pool.query(
        `SELECT COUNT(*) AS total
         FROM transactions
         WHERE id_utilisateur = $1 AND statut_paiement IN ('SUCCESS', '200')`,
        [studentId],
      ),
    ])

    if (studentResult.rowCount === 0) {
      return res.status(404).json({ error: 'Eleve introuvable' })
    }

    const student = studentResult.rows[0]
    const purchases = Number(purchasesResult.rows[0]?.total || 0)

    res.json({
      profile: {
        id: student.id_utilisateur,
        fullName: [student.prenom, student.nom].filter(Boolean).join(' '),
        email: student.email,
        school: {
          id: student.id_etablissement || '',
          name: student.nom_etablissement || 'Aucune ecole associee',
          city: student.ville || '',
          phone: student.telephone_contact || '',
        },
        purchases,
      },
    })
  } catch (error) {
    console.error('Erreur profil eleve:', error)
    res.status(500).json({ error: "Impossible de charger le profil eleve" })
  }
})

app.post('/api/student/profile', async (req, res) => {
  try {
    const studentId = normalizeText(req.body.studentId)
    const fullName = normalizeText(req.body.fullName)

    if (!studentId) {
      return res.status(400).json({ error: 'Utilisateur eleve requis' })
    }
    if (!requireOwner(req, res, studentId)) return

    if (!fullName) {
      return res.status(400).json({ error: 'Nom complet requis' })
    }

    const { prenom, nom } = splitFullName(fullName)
    await pool.query(
      `UPDATE utilisateurs
       SET prenom = $1, nom = $2
       WHERE id_utilisateur = $3`,
      [prenom, nom, studentId],
    )

    res.json({ ok: true })
  } catch (error) {
    console.error('Erreur mise a jour profil eleve:', error)
    res.status(500).json({ error: "Impossible de mettre a jour le profil eleve" })
  }
})

const finalizeSuccessfulTransaction = async (client: pg.PoolClient, transaction: any, paymentReferenceOverride?: string) => {
  if (!transaction) throw new Error('[YabisoPay] Transaction non fournie pour finalisation')
  if (!transaction.id_utilisateur && !transaction.id_etablissement) {
    console.warn('[YabisoPay] Aucun utilisateur/Ã©tablissement pour crÃ©diter, mais finalisation demandÃ©e')
  }
  if (!transaction.montant || Number(transaction.montant) <= 0) {
    throw new Error('[YabisoPay] Montant invalide pour finalisation: ' + transaction.montant)
  }
  
  const paymentReference = paymentReferenceOverride || transaction.ref_externe || transaction.ref_interne
  if (!paymentReference) throw new Error('[YabisoPay] Aucune rÃ©fÃ©rence de paiement pour enregistrement')
  
  try {
    const payment = await client.query(
      `INSERT INTO paiements (type_utilisateur, id_sujet, id_utilisateur, numero_achat, reference, montant)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (reference) DO NOTHING`,
      [transaction.user_role || 'student', transaction.id_sujet, transaction.id_utilisateur, `ACH-${Date.now()}`, paymentReference, transaction.montant],
    )
    console.log(`[YabisoPay] Paiement enregistrÃ© (ref: ${paymentReference}, rows: ${payment.rowCount})`)
    
    if (payment.rowCount && transaction.id_utilisateur) {
      const creditResult = await client.query(
        `UPDATE profils_enseignants SET solde_gagne = solde_gagne + $1 WHERE id_utilisateur = (SELECT id_enseignant FROM sujets WHERE id_sujet = $2)`,
        [Math.round(Number(transaction.montant) * 0.7), transaction.id_sujet],
      )
      console.log(`[YabisoPay] CrÃ©dit enseignant: ${creditResult.rowCount} ligne(s) mise(s) Ã  jour`)
      if (!creditResult.rowCount) {
        console.warn(`[YabisoPay] ATTENTION: Aucun enseignant crÃ©ditÃ© pour le document ${transaction.id_sujet}. VÃ©rifier l'existence du document.`)
      }
    } else if (payment.rowCount) {
      console.log(`[YabisoPay] Paiement enregistrÃ© mais pas de crÃ©dits enseignant (pas de id_utilisateur)`)
    } else {
      console.log(`[YabisoPay] Paiement dÃ©jÃ  enregistrÃ© (conflit sur ref: ${paymentReference})`)
    }
  } catch (error) {
    console.error(`[YabisoPay] Erreur finalisation (ref: ${paymentReference}):`, error)
    throw new Error(`Impossible de finaliser le paiement: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const finalizeSchoolSubscriptionPayment = async (
  client: pg.PoolClient,
  references: string[],
  succeeded: boolean,
  externalReference?: string | null,
) => {
  const pending = await client.query(
    `SELECT reference, id_etablissement, montant, statut, date_creation, date_initiation FROM school_subscription_payments
     WHERE reference = ANY($1::text[]) OR reference_externe = ANY($1::text[])
     FOR UPDATE`,
    [references],
  )
  if (!pending.rowCount) return false
  const payment = pending.rows[0]
  if (payment.statut !== 'PENDING') return payment.statut
  const initiatedAt = new Date(payment.date_initiation || payment.date_creation).getTime()
  const expired = Number.isFinite(initiatedAt) && Date.now() - initiatedAt >= PAYMENT_CONFIRMATION_TIMEOUT_MS
  const finalStatus = succeeded && !expired ? 'SUCCESS' : 'FAILED'
  if (finalStatus === 'SUCCESS') {
    const current = await client.query(
      `SELECT date_fin FROM abonnements
       WHERE id_etablissement = $1 AND statut = 'ACTIVE' AND date_fin > NOW()
       ORDER BY date_fin DESC LIMIT 1`,
      [payment.id_etablissement],
    )
    const start = current.rows[0]?.date_fin ? new Date(current.rows[0].date_fin) : new Date()
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 30)
    await client.query(
      `UPDATE abonnements SET statut = 'EXPIREE'
       WHERE id_etablissement = $1 AND statut = 'ACTIVE' AND date_fin <= $2`,
      [payment.id_etablissement, new Date()],
    )
    await client.query(
      `INSERT INTO abonnements (id_etablissement, plan, date_debut, date_fin, statut)
       VALUES ($1, 'Mensuel', $2, $3, 'ACTIVE')`,
      [payment.id_etablissement, start, end],
    )
  }
  await client.query(
    `UPDATE school_subscription_payments
     SET statut = $1, reference_externe = COALESCE($2, reference_externe),
         date_confirmation = CASE WHEN $1 = 'SUCCESS' THEN COALESCE(date_confirmation, NOW()) ELSE date_confirmation END
     WHERE reference = $3`,
    [finalStatus, externalReference || null, payment.reference],
  )
  return finalStatus
}

/**
 * =================================================================
 * WEBHOOK CALLBACK YABISOPAY - NOTIFICATIONS ASYNCHRONES
 * =================================================================
 * 
 * URL EN PRODUCTION: https://<domaine-public>/api/payments/yabiso-callback
 * 
 * Pour TESTER EN LOCAL avec Ngrok:
 * 1. Installer Ngrok: https://ngrok.com/download
 * 2. Exposer le serveur local (port 5000):
 *    $ ngrok http 5000
 *    â†’ RÃ©cupÃ©rer l'URL gÃ©nÃ©rÃ©e: https://xxxx-xx-xxx-xx-x.ngrok-free.app
 * 3. Configurer la variable d'environnement ESCHOOL_CALLBACK_URL:
 *    ESCHOOL_CALLBACK_URL=https://xxxx-xx-xxx-xx-x.ngrok-free.app/api/payments/yabiso-callback
 * 4. RedÃ©marrer le serveur (npm run dev)
 * 5. Simuler un webhook avec la route /api/payments/test-callback
 * 
 * FLUX:
 * 1. YabisoPay envoie la notification du statut du paiement
 * 2. VÃ©rification de l'identitÃ© du merchant (ESCHOOL_MERCHANT_ID/NAME)
 * 3. Extraction de la rÃ©fÃ©rence interne/externe du paiement
 * 4. Si paiement rÃ©ussi (Statut=2 ou 200):
 *    - Verrouillage de la transaction (FOR UPDATE)
 *    - Mise Ã  jour du statut Ã  SUCCESS
 *    - Enregistrement du paiement dans la table paiements
 *    - CrÃ©ditage de 70% du montant Ã  l'enseignant
 *    - Notification en temps rÃ©el du catalogue (SSE)
 * 5. Si paiement Ã©chouÃ©: passage Ã  FAILED
 * 6. Toujours retourner HTTP 200 + { status: "RECEIVED" }
 */
app.post('/api/payments/yabiso-callback', async (req, res) => {
  console.log(`[YabisoPay] Callback reçu (brut): ${JSON.stringify(req.body)}`)

  const merchantId = process.env.ESCHOOL_MERCHANT_ID
  const merchantName = process.env.ESCHOOL_MERCHANT_NAME
  
  // 1. VÃ©rifier l'authenticitÃ© du callback (merchant credentials)
  const callbackMerchantId = normalizeText(req.body?.MerchantID || req.body?.merchantID)
  const callbackMerchantName = normalizeText(req.body?.MerchantName || req.body?.merchantName)
  
  if (!merchantId || !merchantName) {
    console.error('[YabisoPay] Callback: Configuration merchant manquante')
    return res.json({ status: 'RECEIVED' })
  }
  
  if (callbackMerchantId !== merchantId || callbackMerchantName !== merchantName) {
    console.error(`[YabisoPay] Callback: IdentitÃ© merchant invalide (attendu: ${merchantId}, reÃ§u: ${callbackMerchantId})`)
    return res.json({ status: 'RECEIVED' })
  }

  // 2. Extraire la rÃ©fÃ©rence du paiement (TransID)
  const referenceCandidates = collectYabisoCallbackReferences(req.body)
  const reference = findYabisoReference(req.body) || referenceCandidates[0]
  if (!referenceCandidates.length) {
    console.warn('[YabisoPay] Callback: RÃ©fÃ©rence manquante dans la rÃ©ponse')
    return res.json({ status: 'RECEIVED' })
  }

  // 3. Logger la rÃ©ponse reÃ§ue
  const extractedStatus = findYabisoStatus(req.body)
  const extractedCode = findYabisoCode(req.body)
  const extractedMessage = findYabisoMessage(req.body)
  console.log(`[YabisoPay] Callback ${reference} (rÃ©ponse brute): ${JSON.stringify(req.body)}`)
  console.log(`[YabisoPay] Callback ${reference} (extraction): Statut='${extractedStatus}' | Code='${extractedCode}' | Message='${extractedMessage}'`)

  // 4. DÃ©terminer le statut du paiement
  const isSuccess = isSuccessfulYabisoStatus(req.body)
  const isFailed = isFailedYabisoStatus(req.body)
  
  if (!isSuccess && !isFailed) {
    // Enregistrer aussi les statuts non terminaux tels que 1 ou 2.
    if (extractedStatus) {
      await pool.query(
        `UPDATE transactions SET statut_paiement = $1, message_statut = $3
         WHERE (ref_interne = ANY($2::text[]) OR ref_externe = ANY($2::text[]) OR reference_groupe = ANY($2::text[]))
           AND statut_paiement IN ('PENDING', '1', '2')`,
        [extractedStatus, referenceCandidates, paymentStatusMessage(false, false)],
      )
    }
    return res.json({ status: 'RECEIVED' })
  }

  // 5. Connecter Ã  la base et initialiser une transaction SQL
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    
    // 6. RÃ©cupÃ©rer la transaction avec verrouillage (FOR UPDATE)
    const transactionResult = await client.query(
      `SELECT t.*, u.role AS user_role
       FROM transactions t
       LEFT JOIN utilisateurs u ON u.id_utilisateur = t.id_utilisateur
       WHERE (t.ref_interne = ANY($1::text[]) OR t.ref_externe = ANY($1::text[]) OR t.reference_groupe = ANY($1::text[]))
       FOR UPDATE OF t`,
      [referenceCandidates],
    )
    
    if (!transactionResult.rowCount) {
      const externalReference = req.body.IDTrans_Extern || req.body.idTrans_Extern || req.body.IDTRANS_EXTERN || null
      const examPaymentResult = await client.query(
        `SELECT * FROM paiements_examens
         WHERE reference = ANY($1::text[]) OR reference_groupe = ANY($1::text[]) OR reference_externe = ANY($1::text[])
         ORDER BY date_creation DESC
         FOR UPDATE`,
        [referenceCandidates],
      )
      if (examPaymentResult.rowCount) {
        for (const payment of examPaymentResult.rows) {
          if (payment.statut !== 'PENDING') continue
          await finalizeExamPayment(client, payment, isSuccess, externalReference)
        }
        await client.query('COMMIT')
        console.log(`[YabisoPay] Callback ${reference}: paiement d’examen traité (${isSuccess ? 'SUCCESS' : 'FAILED'})`)
        return res.json({ status: 'RECEIVED' })
      }

      const subscriptionPaymentFound = await finalizeSchoolSubscriptionPayment(
        client,
        referenceCandidates,
        isSuccess,
        externalReference,
      )
      if (subscriptionPaymentFound) {
        await client.query('COMMIT')
        return res.json({ status: 'RECEIVED' })
      }
      console.warn(`[YabisoPay] Callback ${reference}: Transaction introuvable en BDD (références essayées: ${referenceCandidates.join(', ')})`)
      await client.query('ROLLBACK')
      return res.json({ status: 'RECEIVED' })
    }

    const transactions = transactionResult.rows
    const transaction = transactions[0]
    const externalReference = req.body.IDTrans_Extern || req.body.idTrans_Extern || req.body.IDTRANS_EXTERN || null

    const activeTransactions = transactions.filter((item: any) => ['PENDING', '1', '2'].includes(String(item.statut_paiement)))
    if (activeTransactions.length === 0) {
      await client.query('COMMIT')
      return res.json({ status: 'RECEIVED' })
    }
    const transactionStartedAt = new Date(transaction.date_achat).getTime()
    if (Number.isFinite(transactionStartedAt) && Date.now() - transactionStartedAt >= PAYMENT_CONFIRMATION_TIMEOUT_MS) {
      await client.query(
        `UPDATE transactions SET statut_paiement = '3', message_statut = $2 WHERE id_transaction = ANY($1::text[]) AND statut_paiement IN ('PENDING', '1', '2')`,
        [activeTransactions.map((item: any) => item.id_transaction), 'Délai de confirmation dépassé.'],
      )
      await client.query('COMMIT')
      return res.json({ status: 'RECEIVED' })
    }
    
    if (isSuccess) {
      // 7a. SUCCÃˆS: Mettre Ã  jour le statut Ã  SUCCESS
      console.log(`[YabisoPay] Callback ${reference}: Mise Ã  jour transaction ${transaction.id_transaction} â†’ SUCCESS`)
      const updateResult = await client.query(
        `UPDATE transactions 
         SET statut_paiement = $2, ref_operateur = $1, message_statut = $4 
         WHERE id_transaction = ANY($3::text[])
         RETURNING id_transaction`,
        [externalReference, extractedStatus || '200', activeTransactions.map((item: any) => item.id_transaction), paymentStatusMessage(true, false)],
      )
      
      if (!updateResult.rowCount) {
        console.error(`[YabisoPay] Callback ${reference}: Ã‰chec UPDATE (transaction ${transaction.id_transaction} non trouvÃ©e)`)
        await client.query('ROLLBACK')
        return res.json({ status: 'RECEIVED' })
      }

      // 7b. Finaliser la transaction (crÃ©er paiement + crÃ©diter enseignant 70%)
      for (const activeTransaction of activeTransactions) {
        if (!activeTransaction.id_utilisateur) continue
        try {
          const groupPaymentReference = activeTransaction.reference_groupe || activeTransaction.ref_interne
          await finalizeSuccessfulTransaction(client, activeTransaction, `${groupPaymentReference}-${activeTransaction.id_transaction}`)
        } catch (error) {
          console.error(`[YabisoPay] Callback ${reference}: Erreur finalisation:`, error)
          await client.query('ROLLBACK')
          return res.json({ status: 'RECEIVED' })
        }
      }

      console.log(`[YabisoPay] Callback ${reference}: Paiement CONFIRMÃ‰ âœ“`)
    } else if (isFailed) {
      // 7c. Ã‰CHEC: Mettre Ã  jour le statut Ã  FAILED
      console.log(`[YabisoPay] Callback ${reference}: Mise Ã  jour transaction ${transaction.id_transaction} â†’ FAILED`)
      const updateResult = await client.query(
        `UPDATE transactions 
         SET statut_paiement = $2, ref_operateur = $1, message_statut = $4 
         WHERE id_transaction = ANY($3::text[])
         RETURNING id_transaction`,
        [externalReference, extractedStatus || '3', activeTransactions.map((item: any) => item.id_transaction), paymentStatusMessage(false, true)],
      )
      
      if (!updateResult.rowCount) {
        console.error(`[YabisoPay] Callback ${reference}: Ã‰chec UPDATE (transaction ${transaction.id_transaction} non trouvÃ©e)`)
        await client.query('ROLLBACK')
        return res.json({ status: 'RECEIVED' })
      }

      console.log(`[YabisoPay] Callback ${reference}: Paiement Ã‰CHOUÃ‰ âœ—`)
    }

    // 8. Valider la transaction SQL
    await client.query('COMMIT')

    // 9. Notifier les clients en temps rÃ©el (SSE)
    if (isSuccess) {
      notifyGlobalCatalog()
    }

    // 10. Retourner HTTP 200 + ACK
    return res.json({ status: 'RECEIVED' })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error(`[YabisoPay] Callback ${reference}: Erreur`, error)
    return res.json({ status: 'RECEIVED' })
  } finally {
    client.release()
  }
})



app.post('/api/payments/initiate', requireAuth, async (req, res) => {
  const client = await pool.connect()
  try {
    const auth = (req as any).auth as SessionUser
    if (!['student', 'teacher', 'school'].includes(auth.role)) return res.status(403).json({ error: 'Paiement non autorise' })
    const phone = normalizePhone(req.body.phone)
    const operator = normalizeText(req.body.operator).toLowerCase()
    const documentIds = Array.isArray(req.body.documentIds) ? req.body.documentIds.map((id: unknown) => normalizeText(id)).filter(Boolean) : []
    if (!phone || documentIds.length === 0) return res.status(400).json({ error: 'TÃ©lÃ©phone et documents requis' })
    if (operator !== 'airtel') return res.status(400).json({ error: 'Seul Airtel Money est disponible pour le moment' })

    const documents = await client.query(
      `SELECT id_sujet, reference_sujet, prix FROM sujets WHERE id_sujet = ANY($1::text[]) AND statut = 'VALIDE'`,
      [documentIds],
    )
    if (documents.rowCount !== documentIds.length) return res.status(400).json({ error: 'Un document est invalide ou indisponible' })

    const groupReference = `TRX${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`
    const totalAmount = documents.rows.reduce((sum: number, document: any) => sum + Number(document.prix), 0)
    const transactions: { id: string }[] = []
    await client.query('BEGIN')
    for (const document of documents.rows) {
      const reference = `TRX${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      const transaction = await client.query(
        `INSERT INTO transactions
          (id_utilisateur, id_etablissement, id_sujet, montant, type_utilisateur, statut_paiement, ref_interne, reference_groupe, msisdn)
         VALUES ($1, $2, $3, $4, $5, '1', $6, $7, $8)
         RETURNING id_transaction`,
        [
          auth.role === 'school' ? null : auth.id,
          auth.role === 'school' ? auth.id : null,
          document.id_sujet,
          Number(document.prix),
          transactionUserTypeForRole(auth.role),
          reference,
          groupReference,
          phone,
        ],
      )
      transactions.push({ id: transaction.rows[0].id_transaction })
    }
    await client.query('COMMIT')
    try {
      const externalReference = await requestYabisoPayment(groupReference, groupReference, totalAmount, phone, operator)
      if (!externalReference) throw new Error('YabisoPay n’a pas retourné de référence externe')
      await pool.query(
        `UPDATE transactions SET ref_externe = $1 WHERE id_transaction = $2`,
        [externalReference, transactions[0].id],
      )
      console.log(`[Paiement] Groupe ${groupReference}: ${transactions.length} sujet(s), montant=${totalAmount}, ref externe=${externalReference}`)
    } catch (error) {
      console.error(`[Paiement] Échec du groupe ${groupReference}:`, error)
      await pool.query(
        `UPDATE transactions SET statut_paiement = '3', message_statut = $2 WHERE reference_groupe = $1`,
        [groupReference, 'Le paiement n’a pas pu être lancé. Réessayez.'],
      ).catch(e => console.error('Erreur marquage FAILED:', e))
      throw error
    }
    res.status(202).json({ status: 'PENDING', transactionIds: transactions.map(transaction => transaction.id) })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('Erreur initiation YabisoPay:', error)
    const details = error instanceof Error ? error.message : ''
    const providerHttpError = details.match(/^YabisoPay HTTP (\d+):/)
    if (details.includes('Configuration ESchoolAPI manquante')) {
      return res.status(503).json({ error: 'Dans Render, ESCHOOL_MERCHANT_ID et ESCHOOL_MERCHANT_NAME doivent être renseignés et non vides.', code: 'PAYMENT_MERCHANT_CONFIG_MISSING' })
    }
    if (details.includes('ESCHOOL_CALLBACK_URL')) {
      return res.status(503).json({ error: 'Dans Render, ESCHOOL_CALLBACK_URL doit être une URL HTTPS terminant par /api/payments/yabiso-callback.', code: 'PAYMENT_CALLBACK_CONFIG_INVALID' })
    }
    if (providerHttpError || details.includes('YabisoPay a refusé') || details.includes('YabisoPay n’a pas retourné de référence')) {
      const status = providerHttpError ? ` (HTTP ${providerHttpError[1]})` : ''
      return res.status(502).json({ error: `Le prestataire de paiement a refusé la demande${status}. Vérifiez sa configuration ou contactez l’administrateur.`, code: 'PAYMENT_PROVIDER_REJECTED' })
    }
    if (details.includes('YabisoPay est injoignable')) {
      return res.status(502).json({ error: 'Le service de paiement est momentanément inaccessible. Réessayez plus tard.', code: 'PAYMENT_PROVIDER_UNREACHABLE' })
    }
    res.status(502).json({ error: 'Le paiement n’a pas pu être lancé. Réessayez.', code: 'PAYMENT_INITIATION_FAILED' })
  } finally {
    client.release()
  }
})

app.get('/api/payments/:reference/status', requireAuth, async (req, res) => {
  try {
    const auth = (req as any).auth as SessionUser
    const client = await pool.connect()
    try {
      const result = await client.query(
        `SELECT t.* FROM transactions t
        WHERE (t.id_transaction::text = $1 OR t.ref_interne = $1 OR t.ref_externe = $1) 
        AND (t.id_utilisateur = $2 OR t.id_etablissement = $2) LIMIT 1`,
        [normalizeText(req.params.reference), auth.id],
      )
      if (!result.rowCount) return res.status(404).json({ error: 'Paiement introuvable' })
      
      const transaction = result.rows[0]
      
      if (['FAILED', '3'].includes(String(transaction.statut_paiement))) {
        return res.json({ status: '3', message: transaction.message_statut || paymentStatusMessage(false, true) })
      }
      if (['SUCCESS', '200'].includes(String(transaction.statut_paiement))) {
        return res.json({ status: '200', message: paymentStatusMessage(true, false) })
      }

      const transactionStartedAt = new Date(transaction.date_achat).getTime()
      if (
        ['PENDING', '1', '2'].includes(String(transaction.statut_paiement))
        && Number.isFinite(transactionStartedAt)
        && Date.now() - transactionStartedAt >= PAYMENT_CONFIRMATION_TIMEOUT_MS
      ) {
        const expired = await client.query(
          `UPDATE transactions SET statut_paiement = '3', message_statut = 'Délai de confirmation dépassé.'
           WHERE id_transaction = $1 AND statut_paiement IN ('PENDING', '1', '2')
           RETURNING statut_paiement`,
          [transaction.id_transaction],
        )
        if (expired.rowCount) {
          return res.json({ status: '3', message: 'Délai de confirmation dépassé.' })
        }
        const latest = await client.query(
          `SELECT statut_paiement FROM transactions WHERE id_transaction = $1`,
          [transaction.id_transaction],
        )
        if (['FAILED', '3'].includes(String(latest.rows[0]?.statut_paiement))) {
          return res.json({ status: '3', message: 'Délai de confirmation dépassé.' })
        }
        if (['SUCCESS', '200'].includes(String(latest.rows[0]?.statut_paiement))) {
          return res.json({ status: '200', message: paymentStatusMessage(true, false) })
        }
      }
      
      // VÃ©rifier YabisoPay Ã  chaque appel, y compris si la base locale indique SUCCESS.
      const references = [...new Set([transaction.reference_groupe, transaction.ref_interne, transaction.ref_externe].filter(Boolean))]
      let yabisoStatus: any
      
      try {
        for (const ref of references) {
          try {
            const candidate = await getYabisoStatus(ref)
            yabisoStatus = candidate
            // Une réponse avec un statut (y compris "en attente") est
            // suffisante. Les références alternatives ne servent qu'en cas
            // d'erreur ou de réponse sans statut, sinon on multiplie les appels.
            if (findYabisoStatus(candidate)) break
          } catch (e) {
            if (ref === references[references.length - 1]) throw e
          }
        }
      } catch (error) {
        console.warn('Statut YabisoPay indisponible:', error)
        return res.json({ status: '1', message: paymentStatusMessage(false, false) })
      }
      
      if (!yabisoStatus) {
        return res.json({ status: '1', message: paymentStatusMessage(false, false) })
      }
      
      // Conserver le code exact communiqué par YabisoPay dans la colonne statut_paiement.
      const status = findYabisoStatus(yabisoStatus) || '1'
      const isSuccess = isSuccessfulYabisoStatus(yabisoStatus)
      const isFailed = isFailedYabisoStatus(yabisoStatus)

      const responseMessage = paymentStatusMessage(isSuccess, isFailed)
      
      // Mettre Ã  jour la BDD
      await client.query('BEGIN')
      console.log(`[YabisoPay] Mise Ã  jour: id_transaction=${transaction.id_transaction}, statut=${status}, ref_operateur=${yabisoStatus.IDTrans_Extern || null}`)
      
      const updateResult = await client.query(
        `UPDATE transactions SET statut_paiement = $1, ref_operateur = $2, message_statut = $3 WHERE id_transaction = $4 RETURNING id_transaction`,
        [status, yabisoStatus.IDTrans_Extern || null, responseMessage, transaction.id_transaction],
      )
      
      if (!updateResult.rowCount) {
        await client.query('ROLLBACK')
        throw new Error(`Transaction ${transaction.id_transaction} introuvable pour mise Ã  jour`)
      }
      
      console.log(`[YabisoPay] Mise Ã  jour statut rÃ©ussie pour transaction ${transaction.id_transaction}`)
      
      if (isSuccess && transaction.id_utilisateur) {
        try {
          const groupPaymentReference = transaction.reference_groupe || transaction.ref_interne
          await finalizeSuccessfulTransaction(client, transaction, `${groupPaymentReference}-${transaction.id_transaction}`)
          console.log(`[YabisoPay] Finalisation rÃ©ussie pour transaction ${transaction.id_transaction}`)
        } catch (error) {
          console.error(`[YabisoPay] Erreur finalisation pour ${transaction.id_transaction}:`, error)
          await client.query('ROLLBACK')
          throw error
        }
      }
      
      await client.query('COMMIT')
      console.log(`[YabisoPay] Transaction ${transaction.id_transaction} commise avec succÃ¨s`)
      
      res.json({
        status,
        message: responseMessage,
      })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Erreur statut paiement:', error)
    res.status(500).json({ error: 'Impossible de vÃ©rifier le paiement' })
  }
})

app.post('/api/purchases', requireAuth, async (req, res) => {
  return res.status(410).json({ error: 'Utilisez le flux /api/payments/initiate puis GET /api/payments/:reference/status' })
  const client = await pool.connect()
  try {
    const userId = normalizeText(req.body.userId)
    const rawItems = Array.isArray(req.body.items)
      ? req.body.items
      : [{ documentId: req.body.documentId, amount: req.body.amount }]
    const items = rawItems
      .map((item: any) => ({
        documentId: normalizeText(item.documentId),
      }))
      .filter((item: any) => item.documentId)

    if (!userId || items.length === 0) {
      return res.status(400).json({ error: 'Utilisateur et document requis' })
    }
    const auth = (req as any).auth as SessionUser
    if (!['student', 'teacher'].includes(auth.role) || auth.id !== userId) {
      return res.status(403).json({ error: 'Achat non autorise' })
    }

    await client.query('BEGIN')

    const userResult = await client.query(`SELECT id_utilisateur FROM utilisateurs WHERE id_utilisateur = $1 LIMIT 1`, [userId])

    if (!userResult.rowCount) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Utilisateur introuvable' })
    }

    const purchaseNumber = `ACH-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
    const savedPurchases: any[] = []
    let teacherEarnings = 0

    for (const item of items) {
      const documentResult = await client.query(
        `SELECT d.id_sujet, d.id_enseignant, d.prix, d.titre, c.nom_classe, m.nom_matiere
         FROM sujets d
         JOIN niveaux c ON c.id_classe = d.id_classe
         JOIN matieres m ON m.id_matiere = d.id_matiere
         WHERE d.id_sujet = $1
         LIMIT 1`,
        [item.documentId],
      )

      if (!documentResult.rowCount) {
        await client.query('ROLLBACK')
        return res.status(404).json({ error: 'Document introuvable' })
      }

      const document = documentResult.rows[0]
      const amount = Number(document.prix || 0)
      if (!Number.isFinite(amount) || amount <= 0) {
        await client.query('ROLLBACK')
        return res.status(400).json({ error: 'Montant invalide' })
      }

      const reference = `PAY-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`
      const paymentResult = await client.query(
        `INSERT INTO paiements (type_utilisateur, id_sujet, id_utilisateur, numero_achat, reference, montant)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_paiement, date_paiement`,
        [auth.role, document.id_sujet, userId, purchaseNumber, reference, amount],
      )

      await client.query(
        `INSERT INTO transactions (id_utilisateur, id_sujet, montant, type_utilisateur, statut_paiement, ref_interne)
         VALUES ($1, $2, $3, $4, '200', $5)
         ON CONFLICT (ref_interne) DO NOTHING`,
        [userId, document.id_sujet, amount, transactionUserTypeForRole(auth.role), reference],
      )

      const earning = Math.round(amount * 0.7)
      teacherEarnings += earning
      await client.query(
        `UPDATE profils_enseignants
         SET solde_gagne = solde_gagne + $1
         WHERE id_utilisateur = $2`,
        [earning, document.id_enseignant],
      )

      savedPurchases.push({
        id: paymentResult.rows[0].id_paiement,
        paperId: document.id_sujet,
        title: document.titre,
        subject: document.nom_matiere,
        level: document.nom_classe,
        amount,
        date: formatDate(paymentResult.rows[0].date_paiement),
        purchaseNumber,
        reference,
      })
    }

    await client.query('COMMIT')
    notifyGlobalCatalog()

    res.status(201).json({
      ok: true,
      purchases: savedPurchases,
      teacherEarnings,
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('Erreur achat:', error)
    res.status(500).json({ error: "Impossible d'enregistrer l'achat" })
  } finally {
    client.release()
  }
})

app.get('/api/teacher/profile', async (req, res) => {
  try {
    const teacherId = normalizeText(req.query.teacherId)
    if (!teacherId) {
      return res.status(400).json({ error: 'teacherId requis' })
    }

    const [profileResult, schoolsResult, availableSchoolsResult, documentsResult] = await Promise.all([
      pool.query(`
        SELECT u.id_utilisateur, u.nom, u.prenom, u.email, p.cycle, p.matiere_principale, p.photo_url, p.biographie, p.telephone, p.statut_approbation
        FROM utilisateurs u
        LEFT JOIN profils_enseignants p ON p.id_utilisateur = u.id_utilisateur
        WHERE u.id_utilisateur = $1
        LIMIT 1
      `, [teacherId]),
      pool.query(`
        SELECT e.id_etablissement, e.nom_etablissement, e.ville, e.email_officiel,
               COALESCE(a.statut_approbation, 'EN_ATTENTE') AS statut_approbation
        FROM (
          SELECT u.id_etablissement, 'VALIDE' AS statut_approbation
          FROM utilisateurs u
          WHERE u.id_utilisateur = $1 AND u.id_etablissement IS NOT NULL
          UNION ALL
          SELECT a.id_etablissement, a.statut_approbation
          FROM enseignant_etablissements a
          WHERE a.id_enseignant = $1
        ) s
        JOIN etablissements e ON e.id_etablissement = s.id_etablissement
        LEFT JOIN enseignant_etablissements a ON a.id_enseignant = $1 AND a.id_etablissement = e.id_etablissement
        ORDER BY e.nom_etablissement
      `, [teacherId]),
      pool.query(`
        SELECT id_etablissement, nom_etablissement, ville, email_officiel
        FROM etablissements
        WHERE est_verifie = true
        ORDER BY nom_etablissement
      `),
      pool.query(`
        SELECT d.*, c.nom_classe, m.nom_matiere, u.nom, u.prenom, u.id_utilisateur AS id_enseignant,
               e.nom_etablissement, p.photo_url, p.biographie,
               COUNT(t.id_transaction) FILTER (WHERE t.statut_paiement IN ('SUCCESS', '200')) AS downloads
        FROM sujets d
        JOIN niveaux c ON c.id_classe = d.id_classe
        JOIN matieres m ON m.id_matiere = d.id_matiere
        JOIN utilisateurs u ON u.id_utilisateur = d.id_enseignant
        LEFT JOIN profils_enseignants p ON p.id_utilisateur = u.id_utilisateur
        LEFT JOIN etablissements e ON e.id_etablissement = d.id_etablissement
        LEFT JOIN transactions t ON t.id_sujet = d.id_sujet
        WHERE d.id_enseignant = $1 AND d.statut = 'VALIDE'
        GROUP BY d.id_sujet, c.nom_classe, m.nom_matiere, u.nom, u.prenom, u.id_utilisateur, e.nom_etablissement, p.photo_url, p.biographie
        ORDER BY d.date_televersement DESC
      `, [teacherId]),
    ])

    const profile = profileResult.rows[0] || null
    const papers = documentsResult.rows.map(mapDocument)
    const grouped = papers.reduce((acc: Record<string, any[]>, paper) => {
      const key = paper.subject || 'Autres'
      if (!acc[key]) acc[key] = []
      acc[key].push(paper)
      return acc
    }, {})

    return res.json({
      profile: profile ? {
        id: profile.id_utilisateur,
        name: [profile.prenom, profile.nom].filter(Boolean).join(' '),
        email: profile.email,
        cycle: profile.cycle || '',
        subject: profile.matiere_principale || '',
        photoUrl: normalizeAssetUrl(profile.photo_url || ''),
        bio: profile.biographie || '',
        phone: profile.telephone || '',
        status: profile.statut_approbation || 'EN_ATTENTE',
      } : null,
      schools: schoolsResult.rows.map(row => ({
        id: row.id_etablissement,
        name: row.nom_etablissement,
        city: row.ville,
        email: row.email_officiel,
        status: row.statut_approbation,
      })),
      availableSchools: availableSchoolsResult.rows.map(row => ({
        id: row.id_etablissement,
        name: row.nom_etablissement,
        city: row.ville,
        email: row.email_officiel,
      })),
      papersByCategory: Object.entries(grouped).map(([category, items]) => ({ category, papers: items })),
    })
  } catch (error) {
    console.error('Erreur profil enseignant:', error)
    return res.status(500).json({ error: 'Impossible de charger le profil enseignant' })
  }
})

app.post('/api/teacher/profile', requireAuth, requireRole('teacher'), upload.single('photo'), async (req, res) => {
  try {
    const teacherId = normalizeText(req.body.teacherId)
    const fullName = normalizeText(req.body.fullName)
    const bio = normalizeText(req.body.bio)
    const cycle = normalizeText(req.body.cycle)
    const subject = normalizeText(req.body.subject)
    const phone = normalizeText(req.body.phone)
    const schoolId = normalizeText(req.body.schoolId)
const photoUrl = req.file ? normalizeAssetUrl(req.file.path) : null

    if (!teacherId) {
      return res.status(400).json({ error: 'teacherId requis' })
    }
    const auth = (req as any).auth as SessionUser
    if (auth.role !== 'teacher' || auth.id !== teacherId) {
      return res.status(403).json({ error: 'Modification non autorisee' })
    }

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const { prenom, nom } = splitFullName(fullName || 'Utilisateur')
      await client.query(
        `UPDATE utilisateurs SET prenom = $1, nom = $2 WHERE id_utilisateur = $3`,
        [prenom, nom, teacherId],
      )

      await client.query(
        `INSERT INTO profils_enseignants (id_utilisateur, cycle, matiere_principale, biographie, telephone, photo_url, statut_approbation)
         VALUES ($1, $2, $3, $4, $5, $6, 'EN_ATTENTE')
         ON CONFLICT (id_utilisateur)
         DO UPDATE SET cycle = EXCLUDED.cycle,
                       matiere_principale = EXCLUDED.matiere_principale,
                       biographie = EXCLUDED.biographie,
                       telephone = EXCLUDED.telephone,
                       photo_url = COALESCE(EXCLUDED.photo_url, profils_enseignants.photo_url),
                       statut_approbation = COALESCE(profils_enseignants.statut_approbation, 'EN_ATTENTE')`,
        [teacherId, cycle || 'LycÃ©e', subject || '', bio, phone, photoUrl],
      )

      if (schoolId) {
        await client.query(
          `UPDATE utilisateurs SET id_etablissement = $1 WHERE id_utilisateur = $2 AND (id_etablissement IS NULL OR id_etablissement = $1)`,
          [schoolId, teacherId],
        )

        await client.query(
          `INSERT INTO enseignant_etablissements (id_enseignant, id_etablissement, statut_approbation)
           VALUES ($1, $2, 'EN_ATTENTE')
           ON CONFLICT (id_enseignant, id_etablissement) DO NOTHING`,
          [teacherId, schoolId],
        )
      }

      await client.query('COMMIT')
      return res.json({ ok: true })
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    console.error('Erreur mise Ã  jour profil enseignant:', error)
    return res.status(500).json({ error: 'Impossible de mettre Ã  jour le profil enseignant' })
  }
})

app.post('/api/teacher/upload', requireAuth, requireRole('teacher'), upload.single('file'), async (req, res) => {
  try {
    const teacherId = normalizeText(req.body.teacherId)
    const title = normalizeText(req.body.title)
    const description = normalizeText(req.body.description)
    const subjectType = normalizeText(req.body.subjectType)
    const classId = normalizeText(req.body.classId)
    const subjectId = normalizeText(req.body.subjectId)
    const period = normalizeText(req.body.period)
    const fileUrl = req.file?.path || '#'
    const allowedSubjectTypes = ['Devoir sur table', 'Composition', 'Examen blanc', 'Examen rouge']

    if (!teacherId || !title || !description || !subjectType || !classId || !subjectId || !period) {
      return res.status(400).json({ error: 'Champs requis manquants pour le sujet' })
    }
    const auth = (req as any).auth as SessionUser
    if (auth.role !== 'teacher' || auth.id !== teacherId) {
      return res.status(403).json({ error: 'Depot non autorise' })
    }

    if (description.length > 500) {
      return res.status(400).json({ error: 'La description ne doit pas depasser 500 caracteres' })
    }

    if (!allowedSubjectTypes.includes(subjectType)) {
      return res.status(400).json({ error: 'Type de sujet invalide' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Fichier requis pour le dÃ©pÃ´t du sujet' })
    }

    const [classCheck, subjectCheck, teacherResult] = await Promise.all([
      pool.query('SELECT 1 FROM niveaux WHERE id_classe = $1 LIMIT 1', [classId]),
      pool.query('SELECT 1 FROM matieres WHERE id_matiere = $1 LIMIT 1', [subjectId]),
      pool.query(`SELECT id_utilisateur FROM utilisateurs WHERE id_utilisateur = $1 AND lower(role) LIKE 'enseign%' LIMIT 1`, [teacherId]),
    ])

    if (!classCheck.rowCount) {
      return res.status(400).json({ error: 'Classe invalide pour le dÃ©pÃ´t du sujet' })
    }

    if (!subjectCheck.rowCount) {
      return res.status(400).json({ error: 'MatiÃ¨re invalide pour le dÃ©pÃ´t du sujet' })
    }

    if (!teacherResult.rowCount) {
      return res.status(404).json({ error: 'Enseignant introuvable' })
    }

    const result = await pool.query(
      `INSERT INTO sujets (titre, description, type_document, id_enseignant, id_etablissement, id_classe, id_matiere, prix, statut, url_fichier, periode)
      VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, 'VALIDE', $8, $9)
       RETURNING *`,
      [title, description, subjectType, teacherId, classId, subjectId, SUBJECT_FIXED_PRICE, fileUrl, period],
    )

    const documentResult = await pool.query(`
      SELECT d.*, c.nom_classe, m.nom_matiere, u.nom, u.prenom, u.id_utilisateur AS id_enseignant,
             e.nom_etablissement, p.photo_url, p.biographie,
             0 AS downloads
      FROM sujets d
      JOIN niveaux c ON c.id_classe = d.id_classe
      JOIN matieres m ON m.id_matiere = d.id_matiere
      JOIN utilisateurs u ON u.id_utilisateur = d.id_enseignant
      LEFT JOIN profils_enseignants p ON p.id_utilisateur = u.id_utilisateur
      LEFT JOIN etablissements e ON e.id_etablissement = d.id_etablissement
      WHERE d.id_sujet = $1
      LIMIT 1
    `, [result.rows[0].id_sujet])

    notifyGlobalCatalog()
    res.status(201).json({ document: mapDocument(documentResult.rows[0]) })
  } catch (error) {
    console.error('Erreur dÃ©pÃ´t de sujet:', error)
    res.status(500).json({ error: 'Impossible de dÃ©poser le sujet' })
  }
})

app.post('/api/school/teacher-approval', async (req, res) => {
  try {
    const teacherId = normalizeText(req.body.teacherId)
    const action = normalizeText(req.body.action).toLowerCase()

    if (!teacherId || !['approved', 'rejected', 'resubmit'].includes(action)) {
      return res.status(400).json({ error: 'Demande invalide' })
    }
    const schoolId = ((req as any).auth as SessionUser).id
    const membership = await pool.query(
      `SELECT 1 FROM utilisateurs u
       LEFT JOIN enseignant_etablissements ee ON ee.id_enseignant = u.id_utilisateur AND ee.id_etablissement = $2
       WHERE u.id_utilisateur = $1 AND (u.id_etablissement = $2 OR ee.id_etablissement IS NOT NULL)
       LIMIT 1`,
      [teacherId, schoolId],
    )
    if (!membership.rowCount) return res.status(403).json({ error: 'Enseignant non rattache a cette ecole' })

    let status = 'EN_ATTENTE'
    if (action === 'approved') status = 'VALIDE'
    else if (action === 'rejected') status = 'REJETE'
    else if (action === 'resubmit') status = 'EN_ATTENTE'
    const result = await pool.query(
      `UPDATE profils_enseignants SET statut_approbation = $1 WHERE id_utilisateur = $2 RETURNING id_utilisateur`,
      [status, teacherId],
    )

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Profil enseignant introuvable' })
    }

    // Notify any SSE listeners for this teacher
    try {
      const subs = teacherSseMap.get(teacherId) || new Set()
      for (const r of subs) {
        try {
          r.write(`event: status\ndata: ${JSON.stringify({ status })}\n\n`)
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      // ignore
    }

    // Return updated status and teacher id so clients can react
    notifyGlobalCatalog()
    return res.json({ ok: true, status, teacherId })
  } catch (error) {
    console.error('Erreur validation enseignant:', error)
    res.status(500).json({ error: 'Impossible de valider l enseignant' })
  }
})

// Simple SSE implementation: teacher clients can subscribe to receive status updates
const teacherSseMap: Map<string, Set<any>> = new Map()
const globalSseSet: Set<any> = new Set()

const notifyGlobalCatalog = () => {
  for (const response of globalSseSet) {
    try {
      response.write(`event: catalog\ndata: ${JSON.stringify({ updatedAt: new Date().toISOString() })}\n\n`)
    } catch (error) {
      globalSseSet.delete(response)
    }
  }
}

app.get('/api/events/global', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  res.write(': connected\n\n')
  globalSseSet.add(res)

  req.on('close', () => {
    globalSseSet.delete(res)
  })
})

app.get('/api/events', (req, res) => {
  const teacherId = normalizeText(req.query.teacherId)
  if (!teacherId) return res.status(400).json({ error: 'teacherId requis' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  // send a keep-alive comment
  res.write(': connected\n\n')

  const set = teacherSseMap.get(teacherId) || new Set()
  set.add(res)
  teacherSseMap.set(teacherId, set)

  req.on('close', () => {
    set.delete(res)
    if (set.size === 0) teacherSseMap.delete(teacherId)
  })
})

// Endpoint to check teacher approval status
app.get('/api/teacher/status', async (req, res) => {
  try {
    const teacherId = normalizeText(req.query.teacherId)
    if (!teacherId) return res.status(400).json({ error: 'teacherId requis' })

    const result = await pool.query(`SELECT statut_approbation FROM profils_enseignants WHERE id_utilisateur = $1 LIMIT 1`, [teacherId])
    if (!result.rowCount) return res.status(404).json({ error: 'Profil enseignant introuvable' })

    const status = result.rows[0].statut_approbation || 'EN_ATTENTE'
    return res.json({ status })
  } catch (error) {
    console.error('Erreur lecture statut enseignant:', error)
    res.status(500).json({ error: "Impossible de lire le statut de l'enseignant" })
  }
})

app.post('/api/school/paper-approval', async (req, res) => {
  try {
    const paperId = normalizeText(req.body.paperId)
    const action = normalizeText(req.body.action).toLowerCase()
    const reason = normalizeText(req.body.reason) || ''

    if (!paperId || !['approved', 'rejected', 'resubmit'].includes(action)) {
      return res.status(400).json({ error: 'Demande invalide' })
    }
    const schoolId = ((req as any).auth as SessionUser).id

    let status = 'EN_ATTENTE'
    if (action === 'approved') status = 'VALIDE'
    else if (action === 'rejected') status = 'REJETE'
    else if (action === 'resubmit') status = 'EN_ATTENTE'

    const result = await pool.query(
      `UPDATE sujets SET statut = $1, motif_refus = $2
       WHERE id_sujet = $3 AND id_etablissement = $4`,
      [status, action === 'rejected' ? reason : '', paperId, schoolId],
    )

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Sujet introuvable' })
    }

    notifyGlobalCatalog()
    res.json({ ok: true, status, paperId })
  } catch (error) {
    console.error('Erreur validation sujet:', error)
    res.status(500).json({ error: 'Impossible de valider le sujet' })
  }
})

app.post('/api/admin/school-approval', async (req, res) => {
  try {
    const schoolId = normalizeText(req.body.schoolId)
    const action = normalizeText(req.body.action).toLowerCase()

    if (!schoolId || !['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Demande invalide' })
    }

    const verified = action === 'approved'
    const result = await pool.query(
      `UPDATE etablissements SET est_verifie = $1 WHERE id_etablissement = $2 RETURNING id_etablissement`,
      [verified, schoolId],
    )

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Etablissement introuvable' })
    }

    notifyGlobalCatalog()

    // After changing verification, return updated admin dashboard data so UI can refresh counts
    const [schoolsResult, statsResult, topTeachersResult, topPapersResult] = await Promise.all([
      pool.query(`
        SELECT id_etablissement, nom_etablissement, numero_agrement, email_officiel,
               telephone_contact, ville, date_creation
        FROM etablissements
        WHERE est_verifie = false
        ORDER BY date_creation DESC
      `),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM etablissements WHERE est_verifie = false) AS pending_schools,
          (SELECT COUNT(*) FROM etablissements WHERE est_verifie = true) AS verified_schools,
          (SELECT COUNT(*) FROM profils_enseignants WHERE statut_approbation = 'VALIDE') AS active_teachers,
          (SELECT COUNT(*) FROM utilisateurs) AS users
      `),
      pool.query(`
        SELECT u.id_utilisateur, u.nom, u.prenom,
               COALESCE(SUM(t.montant), 0) AS earnings,
               COUNT(t.id_transaction) FILTER (WHERE t.statut_paiement IN ('SUCCESS', '200')) AS downloads
        FROM profils_enseignants p
        JOIN utilisateurs u ON u.id_utilisateur = p.id_utilisateur
        LEFT JOIN sujets d ON d.id_enseignant = u.id_utilisateur
        LEFT JOIN transactions t ON t.id_sujet = d.id_sujet AND t.statut_paiement IN ('SUCCESS', '200')
        GROUP BY u.id_utilisateur, u.nom, u.prenom
        ORDER BY earnings DESC
        LIMIT 6
      `),
      pool.query(`
        SELECT d.id_sujet, d.titre,
               COUNT(t.id_transaction) FILTER (WHERE t.statut_paiement IN ('SUCCESS', '200')) AS downloads
        FROM sujets d
        LEFT JOIN transactions t ON t.id_sujet = d.id_sujet AND t.statut_paiement IN ('SUCCESS', '200')
        GROUP BY d.id_sujet, d.titre
        ORDER BY downloads DESC
        LIMIT 8
      `),
    ])

    return res.json({
      ok: true,
      verified,
      pendingSchools: schoolsResult.rows.map(row => ({
        id: row.id_etablissement,
        name: row.nom_etablissement,
        agrement: row.numero_agrement,
        phone: row.telephone_contact || row.email_officiel,
        date: formatDate(row.date_creation),
        city: row.ville,
        teachers: 0,
      })),
      stats: {
        pendingSchools: Number(statsResult.rows[0].pending_schools || 0),
        verifiedSchools: Number(statsResult.rows[0].verified_schools || 0),
        activeTeachers: Number(statsResult.rows[0].active_teachers || 0),
        users: Number(statsResult.rows[0].users || 0),
      },
      topTeachers: topTeachersResult.rows.map(r => ({ id: r.id_utilisateur, name: [r.prenom, r.nom].filter(Boolean).join(' '), earnings: Number(r.earnings || 0), downloads: Number(r.downloads || 0) })),
      topPapers: topPapersResult.rows.map(r => ({ id: r.id_sujet, title: r.titre, downloads: Number(r.downloads || 0) })),
    })
  } catch (error) {
    console.error('Erreur validation ecole admin:', error)
    res.status(500).json({ error: 'Impossible de valider l etablissement' })
  }
})

app.get('/api/teacher/dashboard', requireAuth, requireRole('teacher'), async (req, res) => {
  try {
    const userId = normalizeText(req.query.userId)
    if (!userId) {
      return res.status(400).json({ error: 'Utilisateur enseignant requis' })
    }
    const auth = (req as any).auth as SessionUser
    if (auth.role !== 'teacher' || auth.id !== userId) return res.status(403).json({ error: 'Acces non autorise' })

    const [documentsResult, transactionsResult, balanceResult] = await Promise.all([
      pool.query(`
        SELECT d.*, c.nom_classe, m.nom_matiere, u.nom, u.prenom, e.nom_etablissement,
               COUNT(t.id_transaction) FILTER (WHERE t.statut_paiement IN ('SUCCESS', '200')) AS downloads,
               COALESCE(SUM(t.montant) FILTER (WHERE t.statut_paiement IN ('SUCCESS', '200')), 0) AS earnings
        FROM sujets d
        JOIN niveaux c ON c.id_classe = d.id_classe
        JOIN matieres m ON m.id_matiere = d.id_matiere
        JOIN utilisateurs u ON u.id_utilisateur = d.id_enseignant
        LEFT JOIN etablissements e ON e.id_etablissement = d.id_etablissement
        LEFT JOIN transactions t ON t.id_sujet = d.id_sujet
        WHERE d.id_enseignant = $1
        GROUP BY d.id_sujet, c.nom_classe, m.nom_matiere, u.nom, u.prenom, e.nom_etablissement
        ORDER BY d.date_televersement DESC
      `, [userId]),
      pool.query(`
        SELECT t.date_achat, t.montant, d.titre
        FROM transactions t
        JOIN sujets d ON d.id_sujet = t.id_sujet
        WHERE t.statut_paiement IN ('SUCCESS', '200')
          AND d.id_enseignant = $1
        ORDER BY t.date_achat DESC
        LIMIT 10
      `, [userId]),
      pool.query('SELECT COALESCE(solde_gagne, 0) AS balance FROM profils_enseignants WHERE id_utilisateur = $1', [userId]),
    ])

    res.json({
      publications: documentsResult.rows.map(row => ({ ...mapDocument(row), earnings: Number(row.earnings || 0) })),
      transactions: transactionsResult.rows.map(row => ({
        date: formatDate(row.date_achat),
        label: `Achat - ${row.titre}`,
        amount: `+${Number(row.montant || 0).toLocaleString('fr-FR')}`,
      })),
      balance: Number(balanceResult.rows[0]?.balance || 0),
    })
  } catch (error) {
    console.error('Erreur dashboard enseignant:', error)
    res.status(500).json({ error: "Impossible de charger l'espace enseignant" })
  }
})

app.get('/api/teacher/withdrawals', requireAuth, requireRole('teacher'), async (req, res) => {
  const auth = (req as any).auth as SessionUser
  try {
    const result = await pool.query(
      `SELECT id_retrait, montant, numero_mobile, statut, motif_rejet, date_demande, date_traitement
       FROM retraits_enseignants WHERE id_enseignant = $1 ORDER BY date_demande DESC LIMIT 30`,
      [auth.id],
    )
    res.json({ withdrawals: result.rows })
  } catch (error) {
    console.error('Erreur chargement retraits enseignant:', error)
    res.status(500).json({ error: 'Impossible de charger les demandes de retrait' })
  }
})

app.post('/api/teacher/withdrawals', requireAuth, requireRole('teacher'), async (req, res) => {
  const auth = (req as any).auth as SessionUser
  const amount = Number(req.body?.amount)
  const mobileNumber = normalizeText(req.body?.mobileNumber)
  if (!Number.isInteger(amount) || amount <= 0 || !/^\+?[0-9][0-9\s-]{5,17}$/.test(mobileNumber)) {
    return res.status(400).json({ error: 'Indiquez un montant positif et un numéro Mobile Money valide' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const profile = await client.query(
      'SELECT solde_gagne FROM profils_enseignants WHERE id_utilisateur = $1 FOR UPDATE',
      [auth.id],
    )
    if (!profile.rowCount) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Profil enseignant introuvable' })
    }
    const balance = Number(profile.rows[0].solde_gagne || 0)
    if (amount > balance) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Le montant dépasse votre solde disponible' })
    }
    await client.query('UPDATE profils_enseignants SET solde_gagne = solde_gagne - $1 WHERE id_utilisateur = $2', [amount, auth.id])
    const result = await client.query(
      `INSERT INTO retraits_enseignants (id_enseignant, montant, numero_mobile)
       VALUES ($1, $2, $3)
       RETURNING id_retrait, montant, numero_mobile, statut, motif_rejet, date_demande, date_traitement`,
      [auth.id, amount, mobileNumber],
    )
    await client.query('COMMIT')
    res.status(201).json({ withdrawal: result.rows[0], balance: balance - amount })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('Erreur demande retrait enseignant:', error)
    res.status(500).json({ error: 'Impossible de créer la demande de retrait' })
  } finally {
    client.release()
  }
})

app.get('/api/admin/teacher-withdrawals', requireAuth, requireRole('admin'), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id_retrait, r.id_enseignant, r.montant, r.numero_mobile, r.statut, r.motif_rejet,
              r.date_demande, r.date_traitement, u.nom, u.prenom
       FROM retraits_enseignants r
       JOIN utilisateurs u ON u.id_utilisateur = r.id_enseignant
       ORDER BY CASE WHEN r.statut = 'EN_ATTENTE' THEN 0 ELSE 1 END, r.date_demande DESC`,
    )
    res.json({ withdrawals: result.rows })
  } catch (error) {
    console.error('Erreur chargement retraits admin:', error)
    res.status(500).json({ error: 'Impossible de charger les demandes de retrait' })
  }
})

app.patch('/api/admin/teacher-withdrawals/:withdrawalId', requireAuth, requireRole('admin'), async (req, res) => {
  const status = normalizeText(req.body?.status).toUpperCase()
  const reason = normalizeText(req.body?.reason)
  if (!['PAYE', 'REJETE'].includes(status) || (status === 'REJETE' && !reason)) {
    return res.status(400).json({ error: 'Statut ou motif de rejet invalide' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `SELECT id_retrait, id_enseignant, montant, statut FROM retraits_enseignants WHERE id_retrait = $1 FOR UPDATE`,
      [req.params.withdrawalId],
    )
    const withdrawal = result.rows[0]
    if (!withdrawal) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Demande de retrait introuvable' })
    }
    if (withdrawal.statut !== 'EN_ATTENTE') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Cette demande a déjà été traitée' })
    }
    if (status === 'REJETE') {
      await client.query('UPDATE profils_enseignants SET solde_gagne = solde_gagne + $1 WHERE id_utilisateur = $2', [withdrawal.montant, withdrawal.id_enseignant])
    }
    const updated = await client.query(
      `UPDATE retraits_enseignants SET statut = $1, motif_rejet = $2, date_traitement = NOW()
       WHERE id_retrait = $3 RETURNING id_retrait, statut, motif_rejet, date_traitement`,
      [status, status === 'REJETE' ? reason : null, withdrawal.id_retrait],
    )
    await client.query('COMMIT')
    res.json({ withdrawal: updated.rows[0] })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    console.error('Erreur traitement retrait admin:', error)
    res.status(500).json({ error: 'Impossible de traiter cette demande' })
  } finally {
    client.release()
  }
})

app.get('/api/school/dashboard', async (req, res) => {
  try {
    const schoolId = normalizeText(req.query.schoolId)
    if (!schoolId) {
      return res.status(400).json({ error: 'Etablissement requis' })
    }
    if (!requireOwner(req, res, schoolId)) return

    const [teachersResult, papersResult] = await Promise.all([
      pool.query(`
        SELECT DISTINCT ON (u.id_utilisateur)
               u.id_utilisateur, u.nom, u.prenom, u.email, u.date_creation,
               p.matiere_principale, p.statut_approbation
        FROM profils_enseignants p
        JOIN utilisateurs u ON u.id_utilisateur = p.id_utilisateur
        LEFT JOIN enseignant_etablissements e ON e.id_enseignant = u.id_utilisateur AND e.id_etablissement = $1
        WHERE u.id_etablissement = $1 OR e.id_etablissement IS NOT NULL
        ORDER BY u.id_utilisateur, u.date_creation DESC
      `, [schoolId]),
      pool.query(`
        SELECT d.*, c.nom_classe, m.nom_matiere, u.nom, u.prenom, e.nom_etablissement,
               0 AS downloads
        FROM sujets d
        JOIN niveaux c ON c.id_classe = d.id_classe
        JOIN matieres m ON m.id_matiere = d.id_matiere
        JOIN utilisateurs u ON u.id_utilisateur = d.id_enseignant
        LEFT JOIN etablissements e ON e.id_etablissement = d.id_etablissement
        WHERE d.id_etablissement = $1
        ORDER BY d.date_televersement DESC
      `, [schoolId]),
    ])

    const mapTeacher = (row: any) => ({
      id: row.id_utilisateur,
      name: [row.prenom, row.nom].filter(Boolean).join(' '),
      phone: row.email,
      date: formatDate(row.date_creation),
      subject: row.matiere_principale,
      status: row.statut_approbation,
    })

    const teachers = teachersResult.rows.map(mapTeacher)
    const papers = papersResult.rows.map(mapDocument)

    res.json({
      pendingTeachers: teachers.filter(teacher => teacher.status === 'EN_ATTENTE'),
      approvedTeachers: teachers.filter(teacher => teacher.status === 'VALIDE'),
      rejectedTeachers: teachers.filter(teacher => teacher.status === 'REJETE'),
      pendingPapers: papers.filter(paper => paper.status === 'EN_ATTENTE'),
      approvedPapers: papers.filter(paper => paper.status === 'VALIDE'),
      rejectedPapers: papers.filter(paper => paper.status === 'REJETE'),
    })
  } catch (error) {
    console.error('Erreur dashboard ecole:', error)
    res.status(500).json({ error: "Impossible de charger l'espace ecole" })
  }
})

app.get('/api/school/profile', async (req, res) => {
  try {
    const schoolId = normalizeText(req.query.schoolId)
    if (!schoolId) {
      return res.status(400).json({ error: 'Etablissement requis' })
    }
    if (!requireOwner(req, res, schoolId)) return

    const [schoolResult, teacherCountResult, paperCountResult, subscriptionResult] = await Promise.all([
      pool.query(`
        SELECT id_etablissement, nom_etablissement, numero_agrement, email_officiel, telephone_contact, ville, fuseau_horaire, date_creation
        FROM etablissements
        WHERE id_etablissement = $1
        LIMIT 1
      `, [schoolId]),
      pool.query(`
        SELECT COUNT(*) AS total
        FROM utilisateurs
        WHERE id_etablissement = $1 AND lower(role) = 'enseignant'
      `, [schoolId]),
      pool.query(`
        SELECT COUNT(*) AS total
        FROM sujets
        WHERE id_etablissement = $1 AND statut = 'VALIDE'
      `, [schoolId]),
      pool.query(`
        SELECT plan, date_debut, date_fin, fuseau_horaire, statut
        FROM abonnements
        WHERE id_etablissement = $1 AND statut = 'ACTIVE'
        ORDER BY date_fin DESC LIMIT 1
      `, [schoolId]),
    ])

    if (schoolResult.rowCount === 0) {
      return res.status(404).json({ error: 'Etablissement introuvable' })
    }

    const school = schoolResult.rows[0]
    const teacherCount = Number(teacherCountResult.rows[0]?.total || 0)
    const paperCount = Number(paperCountResult.rows[0]?.total || 0)

    res.json({
      profile: {
        id: school.id_etablissement,
        name: school.nom_etablissement,
        agrement: school.numero_agrement,
        email: school.email_officiel,
        phone: school.telephone_contact || '',
        city: school.ville || '',
        timezone: school.fuseau_horaire || 'Africa/Brazzaville',
        createdAt: formatDate(school.date_creation),
        teacherCount,
        paperCount,
        subscription: subscriptionResult.rows[0] ? {
          ...subscriptionResult.rows[0],
          active: new Date(subscriptionResult.rows[0].date_fin).getTime() > Date.now(),
        } : null,
      },
    })
  } catch (error) {
    console.error('Erreur profil ecole:', error)
    res.status(500).json({ error: "Impossible de charger le profil ecole" })
  }
})

app.get('/api/school/subscription', requireAuth, requireRole('school'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  try {
    const auth = (req as any).auth as SessionUser
    const result = await pool.query(
      `SELECT plan, date_debut, date_fin, fuseau_horaire, statut FROM abonnements
       WHERE id_etablissement = $1 AND statut = 'ACTIVE' ORDER BY date_fin DESC LIMIT 1`,
      [auth.id],
    )
    const subscription = result.rows[0] || null
    const configuredPrice = SCHOOL_SUBSCRIPTION_PRICE
    res.json({
      subscription: subscription ? { ...subscription, active: new Date(subscription.date_fin).getTime() > Date.now() } : null,
      monthlyPrice: Number.isFinite(configuredPrice) && configuredPrice > 0 ? configuredPrice : null,
    })
  } catch (error) {
    console.error('Erreur abonnement Ã©cole:', error)
    res.status(500).json({ error: 'Impossible de charger lâ€™abonnement' })
  }
})

app.get('/api/school/access', requireAuth, requireRole('school'), async (req, res) => {
  try {
    const auth = (req as any).auth as SessionUser
    const documentId = normalizeText(req.query.documentId)
    if (!documentId) return res.status(400).json({ error: 'Document requis' })
    const [documentResult, subscriptionResult] = await Promise.all([
      pool.query(
        `SELECT 1 FROM sujets WHERE id_sujet = $1 AND statut = 'VALIDE' LIMIT 1`,
        [documentId],
      ),
      pool.query(
        `SELECT 1 FROM abonnements WHERE id_etablissement = $1 AND statut = 'ACTIVE' AND date_fin > NOW() LIMIT 1`,
        [auth.id],
      ),
    ])
    if (!documentResult.rowCount) return res.status(404).json({ error: 'Document introuvable ou indisponible' })
    if (!subscriptionResult.rowCount) return res.status(403).json({ error: 'Abonnement école expiré' })
    res.json({ ok: true, documentId })
  } catch (error) {
    console.error('Erreur autorisation tÃ©lÃ©chargement Ã©cole:', error)
    res.status(500).json({ error: 'Impossible de vÃ©rifier lâ€™accÃ¨s' })
  }
})

app.post('/api/school/subscription', requireAuth, requireRole('school'), async (req, res) => {
  const auth = (req as any).auth as SessionUser
  const price = SCHOOL_SUBSCRIPTION_PRICE
  const phone = normalizePhone(req.body.phone)
  if (!Number.isFinite(price) || price <= 0) {
    return res.status(503).json({ error: 'Définissez le tarif mensuel école dans server/config.ts.' })
  }
  if (!phone) return res.status(400).json({ error: 'Un numéro Airtel Money est requis.' })
  const reference = `SUB${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`
  try {
    await pool.query(
      `INSERT INTO school_subscription_payments (reference, id_etablissement, montant)
       VALUES ($1, $2, $3)`,
      [reference, auth.id, price],
    )
    const externalReference = await requestYabisoPayment(reference, reference, price, phone, 'airtel')
    await pool.query(
      `UPDATE school_subscription_payments
       SET reference_externe = $1, date_initiation = CURRENT_TIMESTAMP
       WHERE reference = $2`,
      [externalReference, reference],
    )
    res.status(202).json({ payment: { reference, status: 'PENDING', amount: price } })
  } catch (error) {
    await pool.query(`UPDATE school_subscription_payments SET statut = 'FAILED' WHERE reference = $1`, [reference]).catch(() => undefined)
    console.error('Erreur initiation abonnement YabisoPay:', error)
    res.status(502).json({ error: 'Le paiement de l’abonnement n’a pas pu être lancé. Réessayez.' })
  }
})

app.get('/api/school/subscription/payment/:reference', requireAuth, requireRole('school'), async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  const auth = (req as any).auth as SessionUser
  const reference = normalizeText(req.params.reference)
  const existing = await pool.query(
    `SELECT reference, reference_externe, statut, date_creation, date_initiation FROM school_subscription_payments
     WHERE reference = $1 AND id_etablissement = $2 LIMIT 1`,
    [reference, auth.id],
  )
  if (!existing.rowCount) return res.status(404).json({ error: 'Paiement introuvable' })
  if (existing.rows[0].statut !== 'PENDING') return res.json({ status: existing.rows[0].statut })
  const initiatedAt = new Date(existing.rows[0].date_initiation || existing.rows[0].date_creation).getTime()
  if (Number.isFinite(initiatedAt) && Date.now() - initiatedAt >= PAYMENT_CONFIRMATION_TIMEOUT_MS) {
    const expired = await pool.query(
      `UPDATE school_subscription_payments SET statut = 'FAILED'
       WHERE reference = $1 AND statut = 'PENDING'
       RETURNING statut`,
      [reference],
    )
    if (expired.rowCount) {
      return res.json({ status: 'FAILED', message: 'Paiement non confirmé après une minute' })
    }
    const latest = await pool.query(
      `SELECT statut FROM school_subscription_payments WHERE reference = $1`,
      [reference],
    )
    return res.json({ status: latest.rows[0]?.statut || 'FAILED' })
  }
  try {
    const references = [...new Set([existing.rows[0].reference, existing.rows[0].reference_externe].filter(Boolean))]
    let providerStatus: any
    let lastStatusError: unknown
    for (const candidate of references) {
      try {
        providerStatus = await getYabisoStatus(candidate)
        lastStatusError = undefined
        if (findYabisoStatus(providerStatus)) break
      } catch (error) {
        lastStatusError = error
        console.warn(`[YabisoPay] Référence de statut abonnement refusée (${candidate}); essai de la suivante si disponible.`, error)
      }
    }
    if (!providerStatus && lastStatusError) throw lastStatusError
    const succeeded = isSuccessfulYabisoStatus(providerStatus)
    const failed = isFailedYabisoStatus(providerStatus)
    if (succeeded || failed) {
      const client = await pool.connect()
      let finalStatus: string | false
      try {
        await client.query('BEGIN')
        finalStatus = await finalizeSchoolSubscriptionPayment(client, references, succeeded, providerStatus.IDTrans_Extern)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
      if (!finalStatus) throw new Error(`Paiement d'abonnement introuvable (${reference})`)
      if (finalStatus === 'SUCCESS') notifyGlobalCatalog()
      return res.json({ status: finalStatus })
    }
    res.json({ status: 'PENDING' })
  } catch (error) {
    console.error('Erreur vérification paiement abonnement:', error)
    res.status(502).json({ error: 'Impossible de vérifier le paiement pour le moment.' })
  }
})

app.post('/api/school/profile', async (req, res) => {
  try {
    const schoolId = normalizeText(req.body.schoolId)
    const name = normalizeText(req.body.name)
    const city = normalizeText(req.body.city)
    const phone = normalizeText(req.body.phone)

    if (!schoolId) {
      return res.status(400).json({ error: 'Etablissement requis' })
    }
    if (!requireOwner(req, res, schoolId)) return

    await pool.query(`
      UPDATE etablissements
      SET nom_etablissement = $1,
          ville = $2,
          telephone_contact = $3
      WHERE id_etablissement = $4
    `, [name, city, phone, schoolId])

    res.json({ ok: true })
  } catch (error) {
    console.error('Erreur mise a jour profil ecole:', error)
    res.status(500).json({ error: "Impossible de mettre a jour le profil ecole" })
  }
})

app.get('/api/admin/dashboard', async (req, res) => {
  try {
    const [schoolsResult, statsResult, topTeachersResult, topPapersResult] = await Promise.all([
      pool.query(`
        SELECT id_etablissement, nom_etablissement, numero_agrement, email_officiel,
               telephone_contact, ville, date_creation
        FROM etablissements
        WHERE est_verifie = false
        ORDER BY date_creation DESC
      `),
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM etablissements WHERE est_verifie = false) AS pending_schools,
          (SELECT COUNT(*) FROM etablissements WHERE est_verifie = true) AS verified_schools,
          (SELECT COUNT(*) FROM profils_enseignants WHERE statut_approbation = 'VALIDE') AS active_teachers,
          (SELECT COUNT(*) FROM utilisateurs) AS users
      `),
      pool.query(`
        SELECT u.id_utilisateur, u.nom, u.prenom,
               COALESCE(SUM(t.montant), 0) AS earnings,
               COUNT(t.id_transaction) FILTER (WHERE t.statut_paiement IN ('SUCCESS', '200')) AS downloads
        FROM profils_enseignants p
        JOIN utilisateurs u ON u.id_utilisateur = p.id_utilisateur
        LEFT JOIN sujets d ON d.id_enseignant = u.id_utilisateur
        LEFT JOIN transactions t ON t.id_sujet = d.id_sujet AND t.statut_paiement IN ('SUCCESS', '200')
        GROUP BY u.id_utilisateur, u.nom, u.prenom
        ORDER BY earnings DESC
        LIMIT 6
      `),
      pool.query(`
        SELECT d.id_sujet, d.titre,
               COUNT(t.id_transaction) FILTER (WHERE t.statut_paiement IN ('SUCCESS', '200')) AS downloads
        FROM sujets d
        LEFT JOIN transactions t ON t.id_sujet = d.id_sujet AND t.statut_paiement IN ('SUCCESS', '200')
        GROUP BY d.id_sujet, d.titre
        ORDER BY downloads DESC
        LIMIT 8
      `),
    ])

    res.json({
      pendingSchools: schoolsResult.rows.map(row => ({
        id: row.id_etablissement,
        name: row.nom_etablissement,
        agrement: row.numero_agrement,
        phone: row.telephone_contact || row.email_officiel,
        date: formatDate(row.date_creation),
        city: row.ville,
        teachers: 0,
      })),
      stats: {
        pendingSchools: Number(statsResult.rows[0].pending_schools || 0),
        verifiedSchools: Number(statsResult.rows[0].verified_schools || 0),
        activeTeachers: Number(statsResult.rows[0].active_teachers || 0),
        users: Number(statsResult.rows[0].users || 0),
      },
      topTeachers: topTeachersResult.rows.map(r => ({ id: r.id_utilisateur, name: [r.prenom, r.nom].filter(Boolean).join(' '), earnings: Number(r.earnings || 0), downloads: Number(r.downloads || 0) })),
      topPapers: topPapersResult.rows.map(r => ({ id: r.id_sujet, title: r.titre, downloads: Number(r.downloads || 0) })),
    })
  } catch (error) {
    console.error('Erreur dashboard admin:', error)
    res.status(500).json({ error: "Impossible de charger l'espace admin" })
  }
})

const startServer = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token TEXT PRIMARY KEY,
        id_user TEXT NOT NULL,
        role TEXT NOT NULL,
        id_school TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions (expires_at);
    `)
    // Les routes d'examens ne sont activées qu'une fois leurs tables disponibles.
    await ensureExamSchema(pool)
    await ensureTeacherProfileSchema()
    await pool.query('UPDATE sujets SET prix = $1 WHERE prix IS DISTINCT FROM $1', [SUBJECT_FIXED_PRICE])
  } catch (error) {
    console.error('Erreur lors de l’initialisation du schéma de la base de données:', error)
    await pool.end().catch(() => undefined)
    process.exitCode = 1
    return
  }

  registerExamRoutes({
    app,
    pool,
    requireAuth,
    requireRole,
    normalizeText,
    normalizePhone,
    notifyGlobalCatalog,
  })

  const distDirectory = path.resolve('dist')
  app.use(express.static(distDirectory))
  app.use((req, res, next) => {
    const indexFile = path.join(distDirectory, 'index.html')
    if (req.method === 'GET' && !req.path.startsWith('/api/') && fs.existsSync(indexFile)) {
      return res.sendFile(indexFile)
    }
    return next()
  })

  app.use(notFoundHandler)
  app.use(errorHandler)

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Le backend de l'application sujet tourne sur le port ${PORT}`)
  })
}

void startServer()
