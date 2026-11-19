export type UserRole = "student" | "teacher" | "school" | "admin";
export type AuthRole = "student" | "teacher" | "school";
export type AuthMode = "login" | "register" | "forgot";
export type PaymentStep = "operator" | "phone" | "ussd" | "failed" | "success";
export type View = "home" | "feed" | "student" | "teacher" | "school" | "admin" | "teacher-profile" | "student-profile" | "exams-catalog" | "exam-detail" | "exam-session" | "student-exams" | "teacher-exams" | "create-exam";
export type AdminView = "admin-niveaux" | "admin-matieres" | "admin-niveau-matieres";

// extend View to include admin pages
export type ViewAll = View | AdminView;

export interface AuthUser {
  id: string;
  role: UserRole;
  name: string;
  email: string;
  phone?: string;
  verified?: boolean;
}

export interface Paper {
  id: string;
  title: string;
  description?: string;
  type?: string;
  subject: string;
  level: string;
  reference?: string;
  year: string;
  price: number;
  downloads: number;
  teacher: { id?: string; name: string; initials: string; avatar?: string; bio?: string };
  school: { name: string; short: string; color: string };
  date: string;
  tags: string[];
  status?: string;
  reason?: string;
  earnings?: number;
  fileUrl?: string;
  period?: string;
}

export interface PurchaseHistoryItem {
  id: string;
  paperId: string;
  title: string;
  subject: string;
  level: string;
  amount: number;
  date: string;
  purchaseNumber: string;
  reference: string;
  subjectReference?: string;
}

export interface CatalogClass {
  id_classe: string;
  nom_classe: string;
  cycle: string;
  code_classe?: string;
}

export interface CatalogSubject {
  id_matiere: string;
  nom_matiere: string;
  code_matiere?: string;
}

export interface CatalogSchool {
  id_etablissement: string;
  nom_etablissement: string;
}

export interface CatalogStats {
  downloads: number;
  teachers: number;
  schools: number;
  users: number;
}

export interface CatalogData {
  classes: CatalogClass[];
  subjects: CatalogSubject[];
  schools: CatalogSchool[];
  papers: Paper[];
  stats: CatalogStats;
}

export interface PendingTeacher {
  id: string;
  name: string;
  phone: string;
  date: string;
  subject: string;
}

export interface PendingSchool {
  id: string;
  name: string;
  agrement: string;
  phone: string;
  date: string;
  city: string;
  teachers: number;
}

export interface TeacherTransaction {
  date: string;
  label: string;
  amount: string;
}

/* ============================================================
   Types pour le parcours Examens Test en Ligne
   ============================================================ */

export type ExamStatut = 'ANNOUNCE' | 'EN_COURS' | 'TERMINE' | 'ANNULE';
export type InscriptionStatut = 'EN_ATTENTE_PAIEMENT' | 'PAYE' | 'GRATUIT_ABONNEMENT' | 'ANNULE';
export type CopyStatut = 'DEPOSEE' | 'CORRIGEE' | 'PUBLIE';
export type PaiementStatut = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface Exam {
  id_examen: string;
  titre: string;
  description: string;
  id_enseignant: string;
  id_classe: string;
  id_matiere: string;
  prix_inscription: number | string;
  duree_minutes: number;
  date_debut: string;
  date_fin: string;
  places_max: number | null;
  url_sujet: string;
  statut: ExamStatut;
  date_creation: string;
  nom_classe?: string;
  nom_matiere?: string;
  nom_enseignant?: string;
  photo_url?: string;
  inscrits?: number;
  note_enseignant?: number;
  nombre_avis?: number;
}

export interface ExamDetail extends Exam {
  inscriptions?: ExamInscription[];
  copies?: ExamCopy[];
}

export interface ExamInscription {
  id_inscription: string;
  id_examen: string;
  id_eleve: string;
  statut: InscriptionStatut;
  reference_paiement?: string;
  date_inscription: string;
}

export interface ExamCopy {
  id_copie: string;
  id_examen: string;
  id_eleve: string;
  url_fichier: string;
  type_fichier?: string;
  nom_fichier?: string;
  date_depot: string;
  nom_eleve?: string;
  valeur?: number;
  appreciation?: string;
  url_corrige?: string;
  note_statut?: CopyStatut;
}

export interface ExamGrade {
  id_examen: string;
  id_eleve: string;
  valeur: number;
  appreciation: string;
  url_corrige?: string;
}

export interface TeacherRating {
  id_avis: string;
  id_enseignant: string;
  id_eleve: string;
  id_examen: string;
  etoiles: number;
  commentaire: string;
  date_avis: string;
  nom_eleve?: string;
}

export interface TeacherSubscription {
  id_abonnement: string;
  id_eleve: string;
  id_enseignant: string;
  plan: string;
  date_debut: string;
  date_fin: string;
  montant: number | string;
  statut: string;
  date_creation: string;
}

export interface ExamPaymentInitiateResponse {
  payment: {
    reference: string;
    status: string;
    amount: number;
  };
}

export interface EnrollExamResponse {
  enrollment: {
    id_inscription: string;
    statut: string;
  };
  requiresPayment: boolean;
  amount: number;
  viaSubscription: boolean;
}
