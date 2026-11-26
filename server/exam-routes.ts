import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import type { Express, NextFunction, Request, Response } from 'express'
import type pg from 'pg'
import { serverConfig } from './config.js'
import { upload, uploadDirectory, resolveUploadPath } from './middleware/upload.js'
import {
  findYabisoStatus,
  getYabisoStatus,
  isFailedYabisoStatus,
  isSuccessfulYabisoStatus,
  requestYabisoPayment,
} from './services/yabiso-pay.js'

type SessionUser = { id: string; role: 'student' | 'teacher' | 'school' | 'admin'; schoolId?: string | null }

export type ExamRouteDeps = {
  app: Express
  pool: pg.Pool
  requireAuth: (req: Request, res: Response, next: NextFunction) => unknown
  requireRole: (...roles: SessionUser['role'][]) => (req: Request, res: Response, next: NextFunction) => unknown
  normalizeText: (value: unknown) => string
  normalizePhone: (value: unknown) => string
  notifyGlobalCatalog?: () => void
}

type ExamRow = {
  id_examen: string
  titre: string
  description: string
  id_enseignant: string
  id_classe: string
  id_matiere: string
  prix_inscription: string
  duree_minutes: number
  date_debut: string
  date_fin: string
  places_max: number | null
  url_sujet: string
  fichiers_sujets: Array<{ url: string; name?: string; mime?: string | null }>
  nom_classe?: string
  nom_matiere?: string
  nom_enseignant?: string
  statut: string
  date_creation: string
}

const PAYMENT_TIMEOUT_MS = 60_000

const buildReference = (prefix: string) =>
  `${prefix}${Date.now()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`

const isPast = (value: string | Date) => new Date(value).getTime() <= Date.now()

/**
 * Enregistre toutes les routes du parcours « examens test en ligne ».
 */
export const registerExamRoutes = (deps: ExamRouteDeps): void => {
  const { app, pool, requireAuth, requireRole, normalizeText, normalizePhone, notifyGlobalCatalog } = deps

  const findExam = async (examId: string): Promise<ExamRow | null> => {
    if (!examId) return null
    const result = await pool.query(
      `SELECT e.*, n.nom_classe, m.nom_matiere,
              concat_ws(' ', u.prenom, u.nom) AS nom_enseignant
       FROM examens e
       JOIN niveaux n ON n.id_classe = e.id_classe
       JOIN matieres m ON m.id_matiere = e.id_matiere
       JOIN utilisateurs u ON u.id_utilisateur = e.id_enseignant
       WHERE e.id_examen = $1 LIMIT 1`,
      [examId],
    )
    const exam = (result.rows[0] as ExamRow | undefined) ?? null
    if (exam && exam.statut !== 'ANNULE') {
      const now = Date.now()
      exam.statut = now < new Date(exam.date_debut).getTime()
        ? 'ANNOUNCE'
        : now < new Date(exam.date_fin).getTime() ? 'EN_COURS' : 'TERMINE'
    }
    return exam
  }

  const sendExamFile = (storedPath: string, res: Response, downloadName?: string) => {
    const uploadsRoot = uploadDirectory
    const filePath = resolveUploadPath(storedPath || '')
    if (!storedPath || !filePath.startsWith(`${uploadsRoot}${path.sep}`) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Fichier introuvable' })
    }
    return res.download(filePath, downloadName || path.basename(filePath))
  }

  const hasActiveSubscription = async (studentId: string, teacherId: string): Promise<boolean> => {
    const result = await pool.query(
      `SELECT 1 FROM abonnements_enseignants
       WHERE id_eleve = $1 AND id_enseignant = $2 AND statut = 'ACTIVE' AND date_fin > NOW()
       LIMIT 1`,
      [studentId, teacherId],
    )
    return Boolean(result.rowCount)
  }

  const teacherOfExam = async (exam: ExamRow | null, teacherId: string) =>
    Boolean(exam) && exam!.id_enseignant === teacherId

  // ---------------------------------------------------------------- catalogue

  app.get('/api/exams', async (req, res) => {
    try {
      const matiere = normalizeText(req.query.matiere)
      const classe = normalizeText(req.query.classe)
      const enseignant = normalizeText(req.query.enseignant)
      const requestedStatus = normalizeText(req.query.status) === 'EN_COURS' ? 'EN_COURS' : 'ANNOUNCE'
      const result = await pool.query(
        `SELECT e.*, c.nom_classe, m.nom_matiere, u.nom, u.prenom, p.photo_url,
                CASE WHEN e.date_debut <= NOW() AND e.date_fin > NOW() THEN 'EN_COURS'
                     WHEN e.date_fin <= NOW() THEN 'TERMINE' ELSE e.statut END AS statut_effectif,
                (SELECT COUNT(*) FROM inscriptions_examens i WHERE i.id_examen = e.id_examen) AS inscrits,
                (SELECT ROUND(AVG(a.etoiles)::numeric, 2) FROM avis_enseignants a
                  WHERE a.id_enseignant = e.id_enseignant) AS note_enseignant,
                (SELECT COUNT(*) FROM avis_enseignants a
                  WHERE a.id_enseignant = e.id_enseignant) AS nombre_avis
         FROM examens e
         JOIN niveaux c ON c.id_classe = e.id_classe
         JOIN matieres m ON m.id_matiere = e.id_matiere
         JOIN utilisateurs u ON u.id_utilisateur = e.id_enseignant
         LEFT JOIN profils_enseignants p ON p.id_utilisateur = u.id_utilisateur
         WHERE e.statut <> 'ANNULE'
           AND (($4 = 'ANNOUNCE' AND e.date_debut > NOW() AND e.statut = 'ANNOUNCE')
             OR ($4 = 'EN_COURS' AND e.date_debut <= NOW() AND e.date_fin > NOW()))
           AND ($1 = '' OR m.nom_matiere = $1)
           AND ($2 = '' OR c.nom_classe = $2)
           AND ($3 = '' OR e.id_enseignant = $3)
         ORDER BY e.date_debut ASC
         LIMIT 100`,
        [matiere, classe, enseignant, requestedStatus],
      )
      res.json({ exams: result.rows })
    } catch (error) {
      console.error('Erreur catalogue examens:', error)
      res.status(500).json({ error: 'Impossible de charger les examens' })
    }
  })

  app.get('/api/exams/payments/:reference/status', requireAuth, requireRole('student'), async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    const auth = (req as any).auth as SessionUser
    const reference = normalizeText(req.params.reference)
    try {
      const existing = await pool.query(
        'SELECT * FROM paiements_examens WHERE reference = $1 AND id_eleve = $2 LIMIT 1',
        [reference, auth.id],
      )
      if (!existing.rowCount) return res.status(404).json({ error: 'Paiement introuvable' })
      const payment = existing.rows[0]
      if (payment.statut !== 'PENDING') return res.json({ status: payment.statut })

      const initiatedAt = new Date(payment.date_initiation || payment.date_creation).getTime()
      if (Number.isFinite(initiatedAt) && Date.now() - initiatedAt >= PAYMENT_TIMEOUT_MS) {
        const expired = await pool.query(
          `UPDATE paiements_examens SET statut = 'FAILED', date_traitement = NOW()
           WHERE reference = $1 AND statut = 'PENDING' RETURNING statut`,
          [reference],
        )
        if (expired.rowCount) return res.json({ status: 'FAILED', message: 'Paiement non confirmé après une minute' })
        const latest = await pool.query('SELECT statut FROM paiements_examens WHERE reference = $1', [reference])
        return res.json({ status: latest.rows[0]?.statut || 'FAILED' })
      }

      const references = [...new Set([payment.reference_groupe, payment.reference, payment.reference_externe].filter(Boolean))] as string[]
      let providerStatus: any
      let lastError: unknown
      for (const candidate of references) {
        try {
          providerStatus = await getYabisoStatus(candidate)
          lastError = undefined
          if (findYabisoStatus(providerStatus)) break
        } catch (error) {
          lastError = error
        }
      }
      if (!providerStatus && lastError) throw lastError

      const succeeded = isSuccessfulYabisoStatus(providerStatus)
      const failed = isFailedYabisoStatus(providerStatus)
      if (!succeeded && !failed) return res.json({ status: 'PENDING' })

      const client = await pool.connect()
      let finalStatus: string | false
      try {
        await client.query('BEGIN')
        finalStatus = await finalizeExamPayment(client, payment, succeeded, providerStatus?.IDTrans_Extern)
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      } finally {
        client.release()
      }
      if (!finalStatus) throw new Error(`Paiement introuvable (${reference})`)
      return res.json({ status: finalStatus })
    } catch (error) {
      console.error('Erreur vérification paiement examen:', error)
      res.status(502).json({ error: 'Impossible de vérifier le paiement pour le moment.' })
    }
  })

  app.get('/api/exams/:examId', requireAuth, async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })

      const [enrollment, grade, rating, subscription, teacher, submissions] = await Promise.all([
        pool.query('SELECT * FROM inscriptions_examens WHERE id_examen = $1 AND id_eleve = $2 LIMIT 1', [exam.id_examen, auth.id]),
        pool.query('SELECT valeur, appreciation, url_corrige, statut FROM notes_examens WHERE id_examen = $1 AND id_eleve = $2 LIMIT 1', [exam.id_examen, auth.id]),
        pool.query('SELECT etoiles, commentaire FROM avis_enseignants WHERE id_examen = $1 AND id_eleve = $2 LIMIT 1', [exam.id_examen, auth.id]),
        pool.query(`SELECT plan, date_fin FROM abonnements_enseignants
                    WHERE id_eleve = $1 AND id_enseignant = $2 AND statut = 'ACTIVE' AND date_fin > NOW()
                    ORDER BY date_fin DESC LIMIT 1`, [auth.id, exam.id_enseignant]),
        pool.query(`SELECT ROUND(AVG(etoiles)::numeric, 2) AS moyenne, COUNT(*) AS total
                    FROM avis_enseignants WHERE id_enseignant = $1`, [exam.id_enseignant]),
        pool.query('SELECT COUNT(*)::int AS total FROM copies_examens WHERE id_examen = $1 AND id_eleve = $2', [exam.id_examen, auth.id]),
      ])

      res.json({
        exam,
        enrollment: enrollment.rows[0] ?? null,
        grade: grade.rows[0] ?? null,
        rating: rating.rows[0] ?? null,
        submissionCount: Number(submissions.rows[0]?.total || 0),
        subscription: subscription.rows[0] ?? null,
        teacherRating: {
          average: Number(teacher.rows[0]?.moyenne || 0),
          count: Number(teacher.rows[0]?.total || 0),
        },
      })
    } catch (error) {
      console.error('Erreur fiche examen:', error)
      res.status(500).json({ error: "Impossible de charger l'examen" })
    }
  })
// ------------------------------------------------------------------ teacher

  app.post('/api/teacher/exams', requireAuth, requireRole('teacher'), upload.array('subjects', 10), async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const body = req.body ?? {}
      const titre = normalizeText(body.title)
      const description = normalizeText(body.description)
      const classId = normalizeText(body.classId)
      const subjectId = normalizeText(body.subjectId)
      const duree = Number(body.durationMinutes)
      const prix = Number(body.price ?? 0)
      const startAt = new Date(normalizeText(body.startAt))

      if (!titre || !classId || !subjectId || !Number.isFinite(duree)) {
        return res.status(400).json({ error: 'Titre, niveau, matière et durée sont requis.' })
      }
      if (description.length > 1000) {
        return res.status(400).json({ error: 'La description ne doit pas dépasser 1000 caractères.' })
      }
      if (!(duree >= 15 && duree <= 300)) {
        return res.status(400).json({ error: 'La durée doit être comprise entre 15 et 300 minutes.' })
      }
      if (!Number.isFinite(startAt.getTime()) || startAt.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'La date de début doit être dans le futur.' })
      }
      const subjectFiles = (req.files as Express.Multer.File[] | undefined) ?? []
      if (subjectFiles.length === 0) return res.status(400).json({ error: 'Ajoutez au moins un fichier au sujet (PDF ou image).' })

      const priceValue = Number.isFinite(prix) && prix >= 0 ? prix : 0
      const endAt = new Date(startAt.getTime() + duree * 60_000)
      const seats = Number(body.maxSeats)

      const subjectMetadata = subjectFiles.map(file => ({ url: file.path, name: file.originalname, mime: file.mimetype }))
      const result = await pool.query(
        `INSERT INTO examens
          (titre, description, id_enseignant, id_classe, id_matiere, prix_inscription,
           duree_minutes, date_debut, date_fin, places_max, statut, url_sujet, fichiers_sujets)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'ANNOUNCE',$11,$12::jsonb)
         RETURNING *`,
        [titre, description, auth.id, classId, subjectId, priceValue, duree, startAt, endAt,
         Number.isFinite(seats) && seats > 0 ? seats : null, subjectFiles[0].path, JSON.stringify(subjectMetadata)],
      )
      res.status(201).json({ exam: result.rows[0] })
    } catch (error) {
      console.error('Erreur annonce examen:', error)
      res.status(500).json({ error: "Impossible d'annoncer l'examen" })
    }
  })

  app.patch('/api/teacher/exams/:examId', requireAuth, requireRole('teacher'), async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const body = req.body ?? {}
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })
      if (!(await teacherOfExam(exam, auth.id))) return res.status(403).json({ error: 'Accès non autorisé' })
      if (exam.statut !== 'ANNOUNCE') {
        return res.status(409).json({ error: 'Seul un examen annoncé peut être modifié.' })
      }

      const statut = normalizeText(body.status)
      if (statut === 'EN_COURS') {
        await pool.query(`UPDATE examens SET statut = 'EN_COURS' WHERE id_examen = $1`, [exam.id_examen])
        return res.json({ ok: true, statut: 'EN_COURS' })
      }
      if (statut === 'ANNULE') {
        await pool.query(`UPDATE examens SET statut = 'ANNULE' WHERE id_examen = $1`, [exam.id_examen])
        await pool.query(
          `UPDATE inscriptions_examens SET statut = 'ANNULE' WHERE id_examen = $1 AND statut <> 'ANNULE'`,
          [exam.id_examen],
        )
        return res.json({ ok: true, statut })
      }

      const titre = normalizeText(body.title) || exam.titre
      const description = body.description === undefined ? exam.description : normalizeText(body.description)
      const prix = body.price === undefined ? Number(exam.prix_inscription) : Number(body.price)
      const duree = body.durationMinutes === undefined ? Number(exam.duree_minutes) : Number(body.durationMinutes)
      const startAt = body.startAt ? new Date(normalizeText(body.startAt)) : new Date(exam.date_debut)
      if (!Number.isFinite(startAt.getTime()) || startAt.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'La date de début doit être dans le futur.' })
      }
      if (!Number.isInteger(duree) || duree < 15 || duree > 300) {
        return res.status(400).json({ error: 'La durée doit être comprise entre 15 et 300 minutes.' })
      }
      if (!Number.isFinite(prix) || prix < 0) return res.status(400).json({ error: 'Le prix doit être positif ou nul.' })
      const dureeFinale = duree
      const classId = normalizeText(body.classId) || exam.id_classe
      const subjectId = normalizeText(body.subjectId) || exam.id_matiere
      const seats = body.maxSeats === undefined ? exam.places_max : (Number(body.maxSeats) > 0 ? Number(body.maxSeats) : null)
      const endAt = new Date(startAt.getTime() + dureeFinale * 60_000)

      const result = await pool.query(
        `UPDATE examens
         SET titre = $1, description = $2, prix_inscription = $3,
             duree_minutes = $4, date_debut = $5, date_fin = $6,
             id_classe = $7, id_matiere = $8, places_max = $9
         WHERE id_examen = $10 RETURNING *`,
        [titre, description, prix, dureeFinale, startAt, endAt, classId, subjectId, seats, exam.id_examen],
      )
      res.json({ exam: result.rows[0] })
    } catch (error) {
      console.error('Erreur mise à jour examen:', error)
      res.status(500).json({ error: "Impossible de mettre à jour l'examen" })
    }
  })

  app.delete('/api/teacher/exams/:examId', requireAuth, requireRole('teacher'), async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })
      if (!(await teacherOfExam(exam, auth.id))) return res.status(403).json({ error: 'Accès non autorisé' })
      if (exam.statut !== 'ANNOUNCE') return res.status(409).json({ error: 'Seul un examen annoncé peut être supprimé.' })
      const [enrollments, payments, submissions] = await Promise.all([
        pool.query('SELECT 1 FROM inscriptions_examens WHERE id_examen = $1 LIMIT 1', [exam.id_examen]),
        pool.query('SELECT 1 FROM paiements_examens WHERE id_examen = $1 LIMIT 1', [exam.id_examen]),
        pool.query('SELECT 1 FROM copies_examens WHERE id_examen = $1 LIMIT 1', [exam.id_examen]),
      ])
      if (enrollments.rowCount || payments.rowCount || submissions.rowCount) {
        return res.status(409).json({ error: 'Cet examen a déjà des inscriptions, paiements ou copies. Annulez-le pour conserver son historique.' })
      }
      await pool.query('DELETE FROM examens WHERE id_examen = $1', [exam.id_examen])
      res.json({ ok: true })
    } catch (error) {
      console.error('Erreur suppression examen:', error)
      res.status(500).json({ error: "Impossible de supprimer l'examen" })
    }
  })

  app.post('/api/teacher/exams/:examId/launch',
    requireAuth, requireRole('teacher'), async (req, res) => {
      const auth = (req as any).auth as SessionUser
      try {
        const exam = await findExam(normalizeText(req.params.examId))
        if (!exam) return res.status(404).json({ error: 'Examen introuvable' })
        if (!(await teacherOfExam(exam, auth.id))) return res.status(403).json({ error: 'Accès non autorisé' })
        if (exam.statut !== 'ANNOUNCE') return res.status(409).json({ error: 'Examen déjà lancé ou clos' })
        if (!exam.url_sujet || exam.url_sujet === '#') return res.status(400).json({ error: "Le sujet de l'examen est requis (PDF ou image)." })
        if (new Date(exam.date_debut).getTime() > Date.now()) return res.status(409).json({ error: "L'examen ne peut pas être lancé avant l'heure prévue." })

        const result = await pool.query(
          `UPDATE examens SET statut = 'EN_COURS' WHERE id_examen = $1 RETURNING *`,
          [exam.id_examen],
        )
        res.json({ exam: result.rows[0] })
      } catch (error) {
        console.error('Erreur lancement examen:', error)
        res.status(500).json({ error: "Impossible de lancer l'examen" })
      }
    })

  // -------------------------------------------------------------- enrollment

  app.post('/api/exams/:examId/enroll', requireAuth, requireRole('student'), async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })
      if (exam.statut !== 'ANNOUNCE') return res.status(409).json({ error: 'Les inscriptions sont closes.' })
      if (isPast(exam.date_debut)) return res.status(409).json({ error: 'Cet examen a déjà commencé.' })

      const existing = await pool.query(
        'SELECT * FROM inscriptions_examens WHERE id_examen = $1 AND id_eleve = $2 LIMIT 1',
        [exam.id_examen, auth.id],
      )
      if (existing.rowCount) {
        return res.status(409).json({ error: 'Vous êtes déjà inscrit à cet examen.', enrollment: existing.rows[0] })
      }

      if (exam.places_max) {
        const count = await pool.query(
          `SELECT COUNT(*)::int AS total FROM inscriptions_examens WHERE id_examen = $1 AND statut <> 'ANNULE'`,
          [exam.id_examen],
        )
        if (Number(count.rows[0].total) >= Number(exam.places_max)) {
          return res.status(409).json({ error: 'Cet examen est complet.' })
        }
      }

      const subscribed = await hasActiveSubscription(auth.id, exam.id_enseignant)
      const montant = subscribed ? 0 : Number(exam.prix_inscription)
      const statut = montant === 0 ? 'GRATUIT_ABONNEMENT' : 'EN_ATTENTE_PAIEMENT'

      const enrollment = await pool.query(
        `INSERT INTO inscriptions_examens (id_examen, id_eleve, statut, reference_paiement)
         VALUES ($1, $2, $3, NULL) RETURNING *`,
        [exam.id_examen, auth.id, statut],
      )
      res.status(201).json({
        enrollment: enrollment.rows[0],
        requiresPayment: montant > 0,
        amount: montant,
        viaSubscription: subscribed,
      })
    } catch (error) {
      console.error('Erreur inscription examen:', error)
      res.status(500).json({ error: 'Inscription impossible' })
    }
  })

  app.post('/api/exams/:examId/cancellation-request', requireAuth, requireRole('student'), async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })
      if (exam.statut !== 'ANNOUNCE' || isPast(exam.date_debut)) {
        return res.status(409).json({ error: 'La demande d’annulation doit être faite avant le début de l’examen.' })
      }
      const result = await pool.query(
        `UPDATE inscriptions_examens SET statut = 'DEMANDE_ANNULATION'
         WHERE id_examen = $1 AND id_eleve = $2
           AND statut IN ('PAYE', 'GRATUIT_ABONNEMENT', 'EN_ATTENTE_PAIEMENT')
         RETURNING *`,
        [exam.id_examen, auth.id],
      )
      if (!result.rowCount) {
        const existing = await pool.query(
          'SELECT statut FROM inscriptions_examens WHERE id_examen = $1 AND id_eleve = $2 LIMIT 1',
          [exam.id_examen, auth.id],
        )
        if (!existing.rowCount) return res.status(404).json({ error: 'Inscription introuvable' })
        if (existing.rows[0].statut === 'DEMANDE_ANNULATION') return res.json({ enrollment: existing.rows[0] })
        return res.status(409).json({ error: 'Cette inscription ne peut plus être annulée.' })
      }
      res.json({ enrollment: result.rows[0] })
    } catch (error) {
      console.error('Erreur demande annulation inscription:', error)
      res.status(500).json({ error: 'Impossible d’envoyer la demande d’annulation' })
    }
  })

  app.post('/api/exams/:examId/payments/initiate', requireAuth, requireRole('student'), async (req, res) => {
    const auth = (req as any).auth as SessionUser
    const phone = normalizePhone(req.body.phone)
    if (!phone) return res.status(400).json({ error: 'Un numéro Airtel Money est requis.' })
    const reference = buildReference('EXA')
    const referenceGroupe = buildReference('EXG')
    try {
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })
      // La période d'inscription prend fin au début de l'épreuve. Le serveur
      // revalide la date ici, même si la page d'inscription est restée ouverte.
      if (exam.statut !== 'ANNOUNCE' || isPast(exam.date_debut)) {
        return res.status(409).json({ error: 'La période d’inscription est terminée. Le paiement de cet examen est fermé.' })
      }
      const montant = Number(exam.prix_inscription)
      if (!Number.isFinite(montant) || montant <= 0) {
        return res.status(400).json({ error: 'Cet examen ne requiert pas de paiement.' })
      }
      const enrollment = await pool.query(
        'SELECT statut FROM inscriptions_examens WHERE id_examen = $1 AND id_eleve = $2 LIMIT 1',
        [exam.id_examen, auth.id],
      )
      if (!enrollment.rowCount) return res.status(403).json({ error: "Inscrivez-vous avant de payer." })
      if (enrollment.rows[0].statut !== 'EN_ATTENTE_PAIEMENT') {
        if (['PAYE', 'GRATUIT_ABONNEMENT'].includes(enrollment.rows[0].statut)) {
          return res.status(409).json({ error: 'Inscription déjà réglée.' })
        }
        return res.status(409).json({ error: 'Cette inscription ne peut plus être payée.' })
      }

      await pool.query(
        `INSERT INTO paiements_examens
          (reference, reference_groupe, type_paiement, id_examen, id_eleve, id_enseignant, montant)
         VALUES ($1, $2, 'INSCRIPTION', $3, $4, $5, $6)`,
        [reference, referenceGroupe, exam.id_examen, auth.id, exam.id_enseignant, montant],
      )
      const externalReference = await requestYabisoPayment(referenceGroupe, reference, montant, phone, 'airtel')
      await pool.query(
        `UPDATE paiements_examens SET reference_externe = $1, date_initiation = NOW() WHERE reference = $2`,
        [externalReference, reference],
      )
      await pool.query(
        `UPDATE inscriptions_examens SET reference_paiement = $1 WHERE id_examen = $2 AND id_eleve = $3`,
        [reference, exam.id_examen, auth.id],
      )
      res.status(202).json({ payment: { reference, status: 'PENDING', amount: montant } })
    } catch (error) {
      await pool.query(`UPDATE paiements_examens SET statut = 'FAILED' WHERE reference = $1`, [reference])
        .catch(() => undefined)
      console.error('Erreur initiation paiement examen:', error)
      const details = error instanceof Error ? error.message : ''
      const providerHttpError = details.match(/^YabisoPay HTTP (\d+):/)
      if (details.includes('Configuration ESchoolAPI manquante')) {
        return res.status(503).json({ error: 'Dans Render, ESCHOOL_MERCHANT_ID et ESCHOOL_MERCHANT_NAME doivent être renseignés et non vides.', code: 'PAYMENT_MERCHANT_CONFIG_MISSING' })
      }
      if (details.includes('ESCHOOL_CALLBACK_URL')) {
        return res.status(503).json({ error: 'Dans Render, ESCHOOL_CALLBACK_URL doit être une URL HTTPS terminant par /api/payments/yabiso-callback.', code: 'PAYMENT_CALLBACK_CONFIG_INVALID' })
      }
      if (providerHttpError) {
        return res.status(502).json({ error: `Le prestataire de paiement a refusé la demande (HTTP ${providerHttpError[1]}). Réessayez plus tard ou contactez l’administrateur.`, code: 'PAYMENT_PROVIDER_REJECTED' })
      }
      if (details.includes('YabisoPay a refusé') || details.includes('YabisoPay n’a pas retourné de référence')) {
        return res.status(502).json({ error: 'Le prestataire de paiement a refusé la demande. Vérifiez les paramètres du compte marchand ou contactez l’administrateur.', code: 'PAYMENT_PROVIDER_REJECTED' })
      }
      if (details.includes('YabisoPay est injoignable')) {
        return res.status(502).json({ error: 'Le service Airtel Money est momentanément inaccessible. Réessayez plus tard.', code: 'PAYMENT_PROVIDER_UNREACHABLE' })
      }
      res.status(502).json({ error: "Le paiement n'a pas pu être lancé. Réessayez.", code: 'PAYMENT_INITIATION_FAILED' })
    }
  })
// ------------------------------------------------------------- submissions

  app.post('/api/exams/:examId/submissions',
    requireAuth, requireRole('student'), upload.array('files', 5), async (req, res) => {
      const auth = (req as any).auth as SessionUser
      try {
        const exam = await findExam(normalizeText(req.params.examId))
        if (!exam) return res.status(404).json({ error: 'Examen introuvable' })

        const enrollment = await pool.query(
          `SELECT 1 FROM inscriptions_examens
           WHERE id_examen = $1 AND id_eleve = $2 AND statut IN ('PAYE', 'GRATUIT_ABONNEMENT')
           LIMIT 1`,
          [exam.id_examen, auth.id],
        )
        if (!enrollment.rowCount) return res.status(403).json({ error: 'Inscription réglée requise.' })
        const now = Date.now()
        const startsAt = new Date(exam.date_debut).getTime()
        const endsAt = new Date(exam.date_fin).getTime()
        if (now < startsAt) return res.status(409).json({ error: "L'examen n'a pas encore commencé." })
        if (now >= endsAt) return res.status(409).json({ error: 'Délai de dépôt dépassé.' })

        const files = (req.files as Express.Multer.File[] | undefined) ?? []
        if (files.length === 0) return res.status(400).json({ error: 'Au moins un fichier est requis.' })

        const inserted: any[] = []
        for (const file of files) {
          const row = await pool.query(
            `INSERT INTO copies_examens (id_examen, id_eleve, url_fichier, type_fichier, nom_fichier)
             VALUES ($1,$2,$3,$4,$5) RETURNING *`,
            [exam.id_examen, auth.id, file.path, file.mimetype, file.originalname],
          )
          inserted.push(row.rows[0])
        }
        res.status(201).json({ submissions: inserted })
      } catch (error) {
        console.error('Erreur dépôt copie:', error)
        res.status(500).json({ error: "Impossible d'envoyer la copie" })
      }
    })

  app.get('/api/exams/:examId/submissions', requireAuth, async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })

      const isOwner = exam.id_enseignant === auth.id
      if (!isOwner && auth.role !== 'student') {
        return res.status(403).json({ error: 'Accès non autorisé' })
      }

      const result = await pool.query(
        `SELECT cp.*, u.nom, u.prenom, n.valeur AS note, n.appreciation, n.url_corrige
         FROM copies_examens cp
         JOIN utilisateurs u ON u.id_utilisateur = cp.id_eleve
         LEFT JOIN notes_examens n ON n.id_examen = cp.id_examen AND n.id_eleve = cp.id_eleve
         WHERE cp.id_examen = $1 ${isOwner ? '' : 'AND cp.id_eleve = $2'}
         ORDER BY cp.date_depot ASC`,
        isOwner ? [exam.id_examen] : [exam.id_examen, auth.id],
      )
      res.json({ submissions: result.rows })
    } catch (error) {
      console.error('Erreur lecture copies:', error)
      res.status(500).json({ error: 'Impossible de charger les copies' })
    }
  })

  // Les fichiers d'examen ne sont pas exposés en statique : chaque téléchargement
  // vérifie l'inscription de l'élève ou la propriété de l'enseignant.
  app.get('/api/exams/:examId/subject', requireAuth, async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })
      if (auth.id !== exam.id_enseignant) {
        const enrollment = await pool.query(
          `SELECT 1 FROM inscriptions_examens WHERE id_examen = $1 AND id_eleve = $2
           AND statut IN ('PAYE', 'GRATUIT_ABONNEMENT') LIMIT 1`, [exam.id_examen, auth.id],
        )
        if (!enrollment.rowCount) return res.status(403).json({ error: 'Inscription réglée requise.' })
        const now = Date.now()
        if (now < new Date(exam.date_debut).getTime()) return res.status(409).json({ error: "Le sujet sera accessible à l'ouverture de la session." })
        if (now >= new Date(exam.date_fin).getTime()) return res.status(410).json({ error: 'La session est terminée.' })
      }
      const files = Array.isArray(exam.fichiers_sujets) ? exam.fichiers_sujets : []
      return sendExamFile(files[0]?.url || exam.url_sujet, res, files[0]?.name)
    } catch (error) {
      console.error('Erreur téléchargement sujet examen:', error)
      return res.status(500).json({ error: 'Impossible de télécharger le sujet' })
    }
  })

  app.get('/api/exams/:examId/subjects/:fileIndex', requireAuth, async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })
      if (auth.id !== exam.id_enseignant) {
        const enrollment = await pool.query(
          `SELECT 1 FROM inscriptions_examens WHERE id_examen = $1 AND id_eleve = $2
           AND statut IN ('PAYE', 'GRATUIT_ABONNEMENT') LIMIT 1`, [exam.id_examen, auth.id],
        )
        if (!enrollment.rowCount) return res.status(403).json({ error: 'Inscription réglée requise.' })
        const now = Date.now()
        if (now < new Date(exam.date_debut).getTime()) return res.status(409).json({ error: "Le sujet sera accessible à l'ouverture de la session." })
        if (now >= new Date(exam.date_fin).getTime()) return res.status(410).json({ error: 'La session est terminée.' })
      }
      const files = Array.isArray(exam.fichiers_sujets) ? exam.fichiers_sujets : []
      const fileIndex = Number(req.params.fileIndex)
      const file = files[fileIndex] || (fileIndex === 0 && exam.url_sujet !== '#' ? { url: exam.url_sujet, name: undefined } : null)
      if (!file) return res.status(404).json({ error: 'Fichier de sujet introuvable' })
      return sendExamFile(file.url, res, file.name)
    } catch (error) {
      console.error('Erreur téléchargement page sujet:', error)
      return res.status(500).json({ error: 'Impossible de télécharger le fichier du sujet' })
    }
  })

  app.get('/api/exams/:examId/submissions/:submissionId/file', requireAuth, async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })
      const result = await pool.query(
        `SELECT id_eleve, url_fichier, nom_fichier FROM copies_examens
         WHERE id_examen = $1 AND id_copie = $2 LIMIT 1`,
        [exam.id_examen, normalizeText(req.params.submissionId)],
      )
      const copy = result.rows[0]
      if (!copy) return res.status(404).json({ error: 'Copie introuvable' })
      if (exam.id_enseignant !== auth.id && (auth.role !== 'student' || copy.id_eleve !== auth.id)) {
        return res.status(403).json({ error: 'Accès non autorisé' })
      }
      return sendExamFile(copy.url_fichier, res, copy.nom_fichier || 'copie')
    } catch (error) {
      console.error('Erreur téléchargement copie examen:', error)
      return res.status(500).json({ error: 'Impossible de télécharger la copie' })
    }
  })

  app.patch('/api/teacher/exams/:examId/submissions/:studentId',
    requireAuth, requireRole('teacher'), upload.single('file'), async (req, res) => {
      const auth = (req as any).auth as SessionUser
      try {
        const exam = await findExam(normalizeText(req.params.examId))
        if (!exam) return res.status(404).json({ error: 'Examen introuvable' })
        if (!(await teacherOfExam(exam, auth.id))) return res.status(403).json({ error: 'Accès non autorisé' })

        const studentId = normalizeText(req.params.studentId)
        const valeur = Number(req.body.grade)
        if (!Number.isFinite(valeur) || valeur < 0 || valeur > 20) {
          return res.status(400).json({ error: 'La note doit être comprise entre 0 et 20.' })
        }

        const corrige = req.file?.path || normalizeText(req.body.correctionUrl)
        const result = await pool.query(
          `INSERT INTO notes_examens (id_examen, id_eleve, valeur, appreciation, url_corrige, statut)
           VALUES ($1,$2,$3,$4,$5,'PUBLIE')
           ON CONFLICT (id_examen, id_eleve) DO UPDATE
             SET valeur = EXCLUDED.valeur,
                 appreciation = EXCLUDED.appreciation,
                 url_corrige = COALESCE(NULLIF(EXCLUDED.url_corrige,''), notes_examens.url_corrige),
                 statut = 'PUBLIE',
                 date_correction = NOW()
           RETURNING *`,
          [exam.id_examen, studentId, valeur, normalizeText(req.body.appreciation), corrige || ''],
        )
        res.json({ grade: result.rows[0] })
      } catch (error) {
        console.error('Erreur correction examen:', error)
        res.status(500).json({ error: "Impossible d'enregistrer la note" })
      }
    })

  // ------------------------------------------------------------- dashboards

  app.get('/api/student/exams', requireAuth, requireRole('student'), async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const result = await pool.query(
        `SELECT e.*, i.statut AS statut_inscription, i.id_inscription, i.reference_paiement,
                c.nom_classe, m.nom_matiere, u.nom, u.prenom,
                n.valeur AS note, n.appreciation, n.url_corrige,
                CASE WHEN e.date_debut <= NOW() AND e.date_fin > NOW() THEN 'EN_COURS'
                     WHEN e.date_fin <= NOW() THEN 'TERMINE' ELSE e.statut END AS statut_effectif,
                (SELECT COUNT(*) FROM copies_examens cp
                  WHERE cp.id_examen = e.id_examen AND cp.id_eleve = i.id_eleve) AS copies_deposees,
                (SELECT etoiles FROM avis_enseignants a
                  WHERE a.id_examen = e.id_examen AND a.id_eleve = i.id_eleve) AS mon_avis
         FROM inscriptions_examens i
         JOIN examens e ON e.id_examen = i.id_examen
         JOIN niveaux c ON c.id_classe = e.id_classe
         JOIN matieres m ON m.id_matiere = e.id_matiere
         JOIN utilisateurs u ON u.id_utilisateur = e.id_enseignant
         LEFT JOIN notes_examens n ON n.id_examen = e.id_examen AND n.id_eleve = i.id_eleve
         WHERE i.id_eleve = $1
         ORDER BY e.date_debut DESC
         LIMIT 100`,
        [auth.id],
      )
      res.json({ exams: result.rows })
    } catch (error) {
      console.error('Erreur examens élève:', error)
      res.status(500).json({ error: 'Impossible de charger vos examens' })
    }
  })

  app.get('/api/teacher/exams', requireAuth, requireRole('teacher'), async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const result = await pool.query(
        `SELECT e.*, c.nom_classe, m.nom_matiere,
                CASE WHEN e.statut = 'ANNULE' THEN 'ANNULE'
                     WHEN e.date_debut > NOW() THEN 'ANNOUNCE'
                     WHEN e.date_fin > NOW() THEN 'EN_COURS' ELSE 'TERMINE' END AS statut_effectif,
                (SELECT COUNT(*) FROM inscriptions_examens i WHERE i.id_examen = e.id_examen) AS inscrits,
                (SELECT COUNT(DISTINCT cp.id_eleve) FROM copies_examens cp WHERE cp.id_examen = e.id_examen) AS copies_recues,
                (SELECT COUNT(DISTINCT cp.id_eleve) FROM copies_examens cp
                  WHERE cp.id_examen = e.id_examen
                    AND NOT EXISTS (SELECT 1 FROM notes_examens n
                                    WHERE n.id_examen = cp.id_examen AND n.id_eleve = cp.id_eleve)) AS copies_a_corriger
         FROM examens e
         JOIN niveaux c ON c.id_classe = e.id_classe
         JOIN matieres m ON m.id_matiere = e.id_matiere
         WHERE e.id_enseignant = $1
         ORDER BY e.date_debut DESC
         LIMIT 100`,
        [auth.id],
      )
      res.json({ exams: result.rows })
    } catch (error) {
      console.error('Erreur examens enseignant:', error)
      res.status(500).json({ error: 'Impossible de charger vos examens' })
    }
  })

  // ------------------------------------------------------------------ ratings

  app.post('/api/exams/:examId/rating', requireAuth, requireRole('student'), async (req, res) => {
    const auth = (req as any).auth as SessionUser
    try {
      const exam = await findExam(normalizeText(req.params.examId))
      if (!exam) return res.status(404).json({ error: 'Examen introuvable' })

      const graded = await pool.query(
        `SELECT 1 FROM notes_examens WHERE id_examen = $1 AND id_eleve = $2 AND statut = 'PUBLIE' LIMIT 1`,
        [exam.id_examen, auth.id],
      )
      if (!graded.rowCount) {
        return res.status(403).json({ error: "Votre copie doit être corrigée avant de noter l'enseignant." })
      }

      const etoiles = Number(req.body.stars)
      if (!Number.isInteger(etoiles) || etoiles < 1 || etoiles > 5) {
        return res.status(400).json({ error: 'La note doit être comprise entre 1 et 5 étoiles.' })
      }

      const result = await pool.query(
        `INSERT INTO avis_enseignants (id_enseignant, id_eleve, id_examen, etoiles, commentaire)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id_examen, id_eleve) DO UPDATE
           SET etoiles = EXCLUDED.etoiles, commentaire = EXCLUDED.commentaire
         RETURNING *`,
        [exam.id_enseignant, auth.id, exam.id_examen, etoiles, normalizeText(req.body.comment).slice(0, 500)],
      )
      if (notifyGlobalCatalog) notifyGlobalCatalog()
      res.status(201).json({ rating: result.rows[0] })
    } catch (error) {
      console.error('Erreur notation enseignant:', error)
      res.status(500).json({ error: "Impossible d'enregistrer votre avis" })
    }
  })

  app.get('/api/teachers/:teacherId/ratings', async (req, res) => {
    try {
      const teacherId = normalizeText(req.params.teacherId)
      const [summary, latest] = await Promise.all([
        pool.query(
          `SELECT ROUND(AVG(etoiles)::numeric, 2) AS moyenne, COUNT(*) AS total
           FROM avis_enseignants WHERE id_enseignant = $1`,
          [teacherId],
        ),
        pool.query(
          `SELECT a.etoiles, a.commentaire, a.date_avis, u.prenom, u.nom
           FROM avis_enseignants a
           JOIN utilisateurs u ON u.id_utilisateur = a.id_eleve
           WHERE a.id_enseignant = $1
           ORDER BY a.date_avis DESC LIMIT 10`,
          [teacherId],
        ),
      ])
      res.json({
        average: Number(summary.rows[0]?.moyenne || 0),
        count: Number(summary.rows[0]?.total || 0),
        ratings: latest.rows,
      })
    } catch (error) {
      console.error('Erreur avis enseignant:', error)
      res.status(500).json({ error: 'Impossible de charger les avis' })
    }
  })

  // ------------------------------------------------------ teacher subscription

  app.get('/api/students/teacher-subscriptions/:teacherId',
    requireAuth, requireRole('student'), async (req, res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      const auth = (req as any).auth as SessionUser
      try {
        const result = await pool.query(
          `SELECT plan, date_debut, date_fin, montant, statut FROM abonnements_enseignants
           WHERE id_eleve = $1 AND id_enseignant = $2 AND statut = 'ACTIVE' AND date_fin > NOW()
           ORDER BY date_fin DESC LIMIT 1`,
          [auth.id, normalizeText(req.params.teacherId)],
        )
        res.json({
          subscription: result.rows[0] ?? null,
          monthlyPrice: serverConfig.teacherSubscriptionPrice,
        })
      } catch (error) {
        console.error('Erreur abonnement enseignant:', error)
        res.status(500).json({ error: "Impossible de charger l'abonnement" })
      }
    })

  app.post('/api/students/teacher-subscriptions/:teacherId',
    requireAuth, requireRole('student'), async (req, res) => {
      const auth = (req as any).auth as SessionUser
      const teacherId = normalizeText(req.params.teacherId)
      const phone = normalizePhone(req.body.phone)
      const price = serverConfig.teacherSubscriptionPrice
      if (!phone) return res.status(400).json({ error: 'Un numéro Airtel Money est requis.' })
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(503).json({ error: "Tarif d'abonnement enseignant non configuré." })
      }
      const reference = buildReference('SUBE')
      try {
        const teacher = await pool.query(
          `SELECT 1 FROM utilisateurs WHERE id_utilisateur = $1 AND lower(role) LIKE 'enseign%' LIMIT 1`,
          [teacherId],
        )
        if (!teacher.rowCount) return res.status(404).json({ error: 'Enseignant introuvable' })
        if (await hasActiveSubscription(auth.id, teacherId)) {
          return res.status(409).json({ error: 'Abonnement déjà actif.' })
        }
        await pool.query(
          `INSERT INTO paiements_examens (reference, type_paiement, id_eleve, id_enseignant, montant)
           VALUES ($1, 'ABONNEMENT_ENSEIGNANT', $2, $3, $4)`,
          [reference, auth.id, teacherId, price],
        )
        const externalReference = await requestYabisoPayment(reference, reference, price, phone, 'airtel')
        await pool.query(
          `UPDATE paiements_examens SET reference_externe = $1, date_initiation = NOW() WHERE reference = $2`,
          [externalReference, reference],
        )
        res.status(202).json({ payment: { reference, status: 'PENDING', amount: price } })
      } catch (error) {
        await pool.query(`UPDATE paiements_examens SET statut = 'FAILED' WHERE reference = $1`, [reference])
          .catch(() => undefined)
        console.error('Erreur initiation abonnement enseignant:', error)
        res.status(502).json({ error: "Le paiement de l'abonnement n'a pas pu être lancé. Réessayez." })
      }
    })
}

/**
 * Finalise un paiement d'examen de façon transactionnelle et idempotente.
 */
export const finalizeExamPayment = async (
  client: pg.PoolClient,
  payment: any,
  succeeded: boolean,
  operatorReference?: string | null,
): Promise<string | false> => {
  const updated = await client.query(
    `UPDATE paiements_examens
     SET statut = $1, reference_externe = COALESCE(reference_externe, $2), date_traitement = NOW()
     WHERE reference = $3 AND statut = 'PENDING' RETURNING *`,
    [succeeded ? 'SUCCESS' : 'FAILED', operatorReference ?? null, payment.reference],
  )
  if (!updated.rowCount) {
    const current = await client.query('SELECT statut FROM paiements_examens WHERE reference = $1', [payment.reference])
    return current.rows[0]?.statut ?? false
  }
  if (!succeeded) return 'FAILED'

  if (payment.type_paiement === 'INSCRIPTION') {
    await client.query(
      `UPDATE inscriptions_examens SET statut = 'PAYE'
       WHERE id_examen = $1 AND id_eleve = $2 AND statut = 'EN_ATTENTE_PAIEMENT'`,
      [payment.id_examen, payment.id_eleve],
    )
  } else if (payment.type_paiement === 'ABONNEMENT_ENSEIGNANT') {
    const debut = new Date()
    const fin = new Date(debut.getTime() + 30 * 24 * 60 * 60 * 1000)
    await client.query(
      `INSERT INTO abonnements_enseignants (id_eleve, id_enseignant, plan, date_debut, date_fin, montant, statut)
       VALUES ($1, $2, 'Mensuel', $3, $4, $5, 'ACTIVE')`,
      [payment.id_eleve, payment.id_enseignant, debut, fin, payment.montant],
    )
  }
  return 'SUCCESS'
}
