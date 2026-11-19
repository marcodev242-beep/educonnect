import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Wallet, Upload, Download, Check, Phone, UserCircle2, Camera, MapPin, Sparkles, Building2, BookOpenCheck, ShoppingCart, Trash2 } from "lucide-react";
import { DashboardHeader } from "../components/DashboardHeader";
import { AuthUser, CatalogClass, CatalogSubject, Paper, PurchaseHistoryItem, TeacherTransaction } from "../types";

export function TeacherDashboard({
  onLogout,
  onFeed,
  onTeacherExams,
  classes,
  subjects,
  user,
  purchasedPapers = [],
  purchaseHistory = [],
  cartPapers = [],
  onRemoveFromCart,
  onCheckoutCart,
}: {
  onLogout: () => void;
  onFeed: () => void;
  onTeacherExams?: () => void;
  classes: CatalogClass[];
  subjects: CatalogSubject[];
  user: AuthUser;
  purchasedPapers?: Paper[];
  purchaseHistory?: PurchaseHistoryItem[];
  cartPapers?: Paper[];
  onRemoveFromCart?: (paperId: string) => void;
  onCheckoutCart?: () => void;
}) {
  const [tab, setTab] = useState<"publications" | "wallet" | "upload" | "purchases" | "cart" | "profile">("publications");
  const [teacherData, setTeacherData] = useState<{ publications: Paper[]; transactions: TeacherTransaction[]; balance: number }>({ publications: [], transactions: [], balance: 0 });
  const [withdrawals, setWithdrawals] = useState<Array<{ id_retrait: string; montant: number | string; numero_mobile: string; statut: string; motif_rejet?: string | null; date_demande: string }>>([]);
  const [withdrawalForm, setWithdrawalForm] = useState({ amount: "", mobileNumber: "" });
  const [withdrawalStatus, setWithdrawalStatus] = useState({ success: "", error: "" });
  const [withdrawalSubmitting, setWithdrawalSubmitting] = useState(false);
  const [profileForm, setProfileForm] = useState({ fullName: user.name, bio: "", cycle: "", subject: "", phone: "", schoolId: "" });
  const [profileStatus, setProfileStatus] = useState<{ success: string; error: string }>({ success: "", error: "" });
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [teacherProfile, setTeacherProfile] = useState<{
    photoUrl: string;
    profile: { fullName: string; bio: string; cycle: string; subject: string; phone: string };
    schools: Array<{ id: string; name: string; city: string; email: string; status: string }>;
    availableSchools: Array<{ id: string; name: string; city: string; email: string }>;
  }>({
    photoUrl: "",
    profile: { fullName: user.name, bio: "", cycle: "", subject: "", phone: "" },
    schools: [],
    availableSchools: [],
  });
  const fixedSubjectPrice = 50;
  const descriptionMaxLength = 500;
  const subjectTypes = ["Devoir sur table", "Composition", "Examen blanc", "Examen rouge"];
  const [uploadForm, setUploadForm] = useState({ title: "", description: "", subjectType: "", classId: "", subjectId: "", period: "", fileUrl: "", fileName: "" });
  const [uploadStatus, setUploadStatus] = useState<{ success: string; error: string }>({ success: "", error: "" });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement | null>(null);
  const cartTotal = cartPapers.reduce((sum, paper) => sum + paper.price, 0);

  const allowedFileTypes = ".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp";
  const allowedExtensions = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.webp'];

  const handleFileSelection = (file: File | null) => {
    if (!file) {
      setSelectedFile(null)
      setUploadForm(prev => ({ ...prev, fileUrl: '', fileName: '' }))
      return
    }

    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!allowedExtensions.includes(extension)) {
      setSelectedFile(null)
      setUploadForm(prev => ({ ...prev, fileUrl: '', fileName: '' }))
      setUploadStatus({ success: '', error: 'Type de fichier non autorisé. Utilisez PDF, DOC, DOCX, PNG, JPG ou WEBP.' })
      return
    }

    setSelectedFile(file)
    setUploadForm(prev => ({ ...prev, fileUrl: URL.createObjectURL(file), fileName: file.name }))
    setUploadStatus({ success: '', error: '' })
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    handleFileSelection(file)
  }

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const file = event.dataTransfer.files?.[0] ?? null
    handleFileSelection(file)
  }

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const filteredSubjects = useMemo(() => {
    if (!uploadForm.classId) {
      return subjects;
    }

    const selectedClass = classes.find(c => c.id_classe === uploadForm.classId);
    if (!selectedClass) {
      return subjects;
    }

    switch (selectedClass.cycle) {
      case "Lycée général":
        return subjects.filter(s =>
          [
            "francais",
            "anglais",
            "espagnol",
            "mathematiques_generales",
            "physique_chimie",
            "svt",
            "histoire_geographie",
            "education_civique",
            "education_physique",
            "sciences_economiques",
            "philosophie",
            "informatique",
          ].includes(s.id_matiere),
        );
      case "Lycée technique":
        return subjects.filter(s =>
          [
            "francais",
            "anglais",
            "mathematiques_techniques",
            "physique_appliquee",
            "informatique_technique",
            "electronique",
            "mecanique",
            "electrotechnique",
            "dessin_industriel",
            "technologie_industrielle",
            "gestion",
            "comptabilite",
            "education_physique",
          ].includes(s.id_matiere),
        );
      default:
        return subjects.filter(s =>
          [
            "francais",
            "anglais",
            "mathematiques_generales",
            "physique_chimie",
            "svt",
            "histoire_geographie",
            "education_civique",
            "education_physique",
            "informatique",
          ].includes(s.id_matiere),
        );
    }
  }, [uploadForm.classId, subjects, classes]);

  const updateUploadForm = (key: keyof typeof uploadForm) => (value: string) => {
    setUploadForm(prev => ({ ...prev, [key]: value }));
    setUploadStatus({ success: "", error: "" });
  };

  const loadWithdrawals = () => fetch('/api/teacher/withdrawals')
    .then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les retraits');
      setWithdrawals(data.withdrawals || []);
    })
    .catch(error => setWithdrawalStatus(current => ({ ...current, error: error instanceof Error ? error.message : 'Erreur inattendue' })));

  const requestWithdrawal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWithdrawalSubmitting(true);
    setWithdrawalStatus({ success: '', error: '' });
    try {
      const response = await fetch('/api/teacher/withdrawals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(withdrawalForm.amount), mobileNumber: withdrawalForm.mobileNumber.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de créer la demande');
      setTeacherData(current => ({ ...current, balance: data.balance }));
      setWithdrawals(current => [data.withdrawal, ...current]);
      setWithdrawalForm({ amount: '', mobileNumber: '' });
      setWithdrawalStatus({ success: 'Demande envoyée. Le retrait sera traité après validation.', error: '' });
    } catch (error) {
      setWithdrawalStatus({ success: '', error: error instanceof Error ? error.message : 'Erreur inattendue' });
    } finally {
      setWithdrawalSubmitting(false);
    }
  };

  const submitUpload = async () => {
    setUploadStatus({ success: "", error: "" });

    const missingFields: string[] = [];

    if (!uploadForm.title.trim()) missingFields.push('titre');
    if (!uploadForm.description.trim()) missingFields.push('description');
    if (!uploadForm.subjectType) missingFields.push('type sujet');
    if (!uploadForm.classId) missingFields.push('classe');
    if (!uploadForm.subjectId) missingFields.push('matière');
    if (!uploadForm.period) missingFields.push('trimestre');
    if (!selectedFile) missingFields.push('fichier');

    if (missingFields.length > 0) {
      setUploadStatus({
        success: "",
        error: `Tous les champs sont obligatoires, y compris le fichier. Champs manquants : ${missingFields.join(', ')}.`,
      });
      return;
    }

    try {
      const formData = new FormData();
      formData.append('teacherId', user.id);
      formData.append('title', uploadForm.title.trim());
      formData.append('description', uploadForm.description.trim());
      formData.append('subjectType', uploadForm.subjectType);
      formData.append('classId', uploadForm.classId);
      formData.append('subjectId', uploadForm.subjectId);
      formData.append('period', uploadForm.period);
      formData.append('file', selectedFile!);

      const response = await fetch('/api/teacher/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Impossible de déposer le sujet');
      }

      setUploadStatus({ success: 'Sujet publie avec succes.', error: '' });
      setUploadForm({ title: '', description: '', subjectType: '', classId: '', subjectId: '', period: '', fileUrl: '', fileName: '' });
      setSelectedFile(null);
      setTeacherData(prev => ({ ...prev, publications: [data.document, ...prev.publications] }));
    } catch (error) {
      setUploadStatus({ success: '', error: error instanceof Error ? error.message : 'Erreur inattendue' });
    }
  };

  useEffect(() => {
    fetch(`/api/teacher/dashboard?userId=${encodeURIComponent(user.id)}`)
      .then(res => res.json())
      .then(setTeacherData)
      .catch(error => console.error("Impossible de charger l'espace enseignant", error));
    loadWithdrawals();

    fetch(`/api/teacher/profile?teacherId=${encodeURIComponent(user.id)}`)
      .then(res => res.json())
      .then(data => {
        setTeacherProfile({
          photoUrl: data.profile?.photoUrl || "",
          profile: {
            fullName: data.profile?.name || user.name,
            bio: data.profile?.bio || "",
            cycle: data.profile?.cycle || "",
            subject: data.profile?.subject || "",
            phone: data.profile?.phone || "",
          },
          schools: data.schools || [],
          availableSchools: data.availableSchools || [],
        });
        setProfileForm({
          fullName: data.profile?.name || user.name,
          bio: data.profile?.bio || "",
          cycle: data.profile?.cycle || "",
          subject: data.profile?.subject || "",
          phone: data.profile?.phone || "",
          schoolId: "",
        });
      })
      .catch(error => console.error("Impossible de charger le profil enseignant", error));
  }, [user.id, user.name]);

  const saveProfile = async () => {
    setProfileStatus({ success: "", error: "" });

    try {
      const payload = new FormData();
      payload.append('teacherId', user.id);
      payload.append('fullName', profileForm.fullName.trim());
      payload.append('bio', profileForm.bio.trim());
      payload.append('cycle', profileForm.cycle);
      payload.append('subject', profileForm.subject.trim());
      payload.append('phone', profileForm.phone.trim());
      if (profilePhoto) payload.append('photo', profilePhoto);

      const response = await fetch('/api/teacher/profile', {
        method: 'POST',
        body: payload,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Impossible de sauvegarder le profil');
      }

      const refreshed = await fetch(`/api/teacher/profile?teacherId=${encodeURIComponent(user.id)}`)
      const refreshedData = await refreshed.json()

      setProfileStatus({ success: 'Profil mis à jour avec succès.', error: '' });
      setProfilePhoto(null);
      setTeacherProfile({
        photoUrl: refreshedData.profile?.photoUrl || "",
        profile: {
          fullName: refreshedData.profile?.name || user.name,
          bio: refreshedData.profile?.bio || "",
          cycle: refreshedData.profile?.cycle || "",
          subject: refreshedData.profile?.subject || "",
          phone: refreshedData.profile?.phone || "",
        },
        schools: refreshedData.schools || [],
        availableSchools: refreshedData.availableSchools || [],
      });
      setProfileForm({
        fullName: refreshedData.profile?.name || user.name,
        bio: refreshedData.profile?.bio || "",
        cycle: refreshedData.profile?.cycle || "",
        subject: refreshedData.profile?.subject || "",
        phone: refreshedData.profile?.phone || "",
        schoolId: "",
      });
      setIsEditingProfile(false);
    } catch (error) {
      setProfileStatus({ success: '', error: error instanceof Error ? error.message : 'Erreur inattendue' });
    }
  };

  const statusConfig: Record<string, { label: string; cls: string }> = {
    VALIDE: { label: "Publié", cls: "bg-green-100 text-green-700" },
    EN_ATTENTE: { label: "Publié", cls: "bg-green-100 text-green-700" },
    REJETE: { label: "Publié", cls: "bg-green-100 text-green-700" },
  };

  return (
    <div className="app-shell min-h-screen">
      <DashboardHeader role="teacher" name={user.name} onLogout={onLogout} onFeed={onFeed} onTeacherExams={onTeacherExams} />
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-12">
        <div className="dashboard-hero p-6 text-white">
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.26em] text-emerald-50">
                <Sparkles size={12} /> Espace enseignant
              </div>
              <h1 className="dashboard-title text-3xl leading-tight sm:text-4xl">Bienvenue, {user.name}</h1>
              <p className="mt-2 text-sm text-emerald-50/80 sm:text-base">
                Publiez vos sujets, suivez vos revenus et gérez votre profil avec une interface plus claire et plus rapide.
              </p>
            </div>
              <div className="flex items-center gap-3 rounded-lg border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/12">
                <Wallet size={18} />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-50/80">Solde</p>
                <p className="text-xl font-black">{teacherData.balance.toLocaleString("fr-FR")} FCFA</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { label: "Sujets publiés", value: teacherData.publications.length.toString(), icon: FileText },
            { label: "Téléchargements", value: teacherData.publications.reduce((sum, p) => sum + p.downloads, 0).toLocaleString("fr-FR"), icon: Download },
            { label: "Écoles associées", value: teacherProfile.schools.length.toString(), icon: Building2 },
          ].map((item) => (
            <div key={item.label} className="rounded-[1.5rem] border border-white/70 bg-white/80 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-800">
                <item.icon size={18} />
              </div>
              <p className="text-2xl font-black text-slate-900">{item.value}</p>
              <p className="text-sm text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-1 rounded-2xl border border-white/80 bg-white/85 p-1 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:grid-cols-6">
          {([ 
            ["publications", "Publications", FileText],
            ["wallet", "Portefeuille", Wallet],
            ["upload", "Publier", Upload],
            ["purchases", "Achats", Download],
            ["cart", "Panier", ShoppingCart],
            ["profile", "Profil", UserCircle2],
          ] as const).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`min-w-0 rounded-lg px-1 py-2.5 text-[11px] font-bold transition-all sm:px-3 sm:text-sm ${tab === t ? "bg-emerald-800 text-white shadow-md" : "text-slate-500 hover:text-emerald-900"}`}
            >
              <span className="flex min-w-0 items-center justify-center gap-1.5">
                <Icon size={14} className="shrink-0" /> <span className="truncate">{label}</span>
              </span>
            </button>
          ))}
        </div>

        {tab === "publications" && (
          <div className="space-y-3">
            {teacherData.publications.map(p => (
              <div key={p.id} className="bg-white/85 rounded-2xl p-4 border border-white/70 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-slate-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-slate-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">{p.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusConfig[p.status || "VALIDE"].cls}`}>
                        {statusConfig[p.status || "VALIDE"].label}
                      </span>
                      {p.downloads > 0 && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Download size={10} /> {p.downloads.toLocaleString()}
                        </span>
                      )}
                      {p.reason && (
                        <span className="text-xs text-red-400 italic">"{p.reason}"</span>
                      )}
                    </div>
                  </div>
                  {p.earnings && p.earnings > 0 && (
                    <span className="text-sm font-black text-green-600 flex-shrink-0">
                      {p.earnings.toLocaleString()} F
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "wallet" && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white shadow-lg">
              <p className="text-sm text-white/60 mb-1">Solde disponible</p>
              <p className="text-4xl font-black tracking-tight">{teacherData.balance.toLocaleString("fr-FR")} <span className="text-2xl text-white/70">FCFA</span></p>
              <p className="text-xs text-white/70 mt-1">Les sommes demandées sont réservées jusqu’au traitement.</p>
            </div>
            <form onSubmit={requestWithdrawal} className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
              <h3 className="text-sm font-black text-slate-800">Demander un retrait Mobile Money</h3>
              <p className="mt-1 text-xs text-slate-500">Le paiement sera envoyé au numéro indiqué après validation.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">Montant (FCFA)
                  <input type="number" min="1" max={teacherData.balance} step="1" required value={withdrawalForm.amount} onChange={event => setWithdrawalForm(current => ({ ...current, amount: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder="Ex. 5000" />
                </label>
                <label className="text-xs font-semibold text-slate-600">Numéro Mobile Money
                  <input type="tel" required value={withdrawalForm.mobileNumber} onChange={event => setWithdrawalForm(current => ({ ...current, mobileNumber: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" placeholder="+242 06 000 00 00" />
                </label>
              </div>
              {withdrawalStatus.error && <p role="alert" className="mt-3 text-xs font-semibold text-red-600">{withdrawalStatus.error}</p>}
              {withdrawalStatus.success && <p role="status" className="mt-3 text-xs font-semibold text-emerald-700">{withdrawalStatus.success}</p>}
              <button type="submit" disabled={withdrawalSubmitting || teacherData.balance <= 0} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                <Phone size={14} /> {withdrawalSubmitting ? 'Envoi…' : 'Demander le retrait'}
              </button>
            </form>
            <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Demandes de retrait</h3>
              {withdrawals.length === 0 ? <p className="text-sm text-slate-400">Aucune demande pour le moment.</p> : withdrawals.map(withdrawal => (
                <div key={withdrawal.id_retrait} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-3 first:border-0 first:pt-0">
                  <div><p className="text-sm font-bold text-slate-700">{Number(withdrawal.montant).toLocaleString('fr-FR')} FCFA · {withdrawal.numero_mobile}</p><p className="text-xs text-slate-400">{new Date(withdrawal.date_demande).toLocaleDateString('fr-FR')}{withdrawal.motif_rejet ? ` · ${withdrawal.motif_rejet}` : ''}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${withdrawal.statut === 'PAYE' ? 'bg-emerald-50 text-emerald-700' : withdrawal.statut === 'REJETE' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>{withdrawal.statut === 'PAYE' ? 'Payé' : withdrawal.statut === 'REJETE' ? 'Rejeté' : 'En attente'}</span>
                </div>
              ))}
            </div>
            <div className="bg-white/85 rounded-2xl border border-white/70 overflow-hidden shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="px-4 py-3 border-b border-slate-50">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Transactions récentes</p>
              </div>
              {teacherData.transactions.map((tx, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3 border-b border-slate-50 last:border-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${tx.amount.startsWith("+") ? "bg-green-50" : "bg-slate-100"}`}>
                    {tx.amount.startsWith("+") ? <Download size={13} className="text-green-600" /> : <Phone size={13} className="text-slate-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{tx.label}</p>
                    <p className="text-[10px] text-slate-300">{tx.date}</p>
                  </div>
                  <span className={`text-sm font-black ${tx.amount.startsWith("+") ? "text-green-600" : "text-slate-500"}`}>
                    {tx.amount} F
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "purchases" && (
          <div className="space-y-4">
            {purchaseHistory.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500">
                Aucun achat enregistrÃ© pour le moment.
              </div>
            ) : (
              purchaseHistory.map(item => (
                <div key={item.id} className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-800">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{item.level} Â· {item.subject} Â· {item.date}</p>
                      <p className="mt-1 text-[10px] font-semibold text-slate-400">NÂ° {item.purchaseNumber} Â· Ref {item.reference}</p>
                    </div>
                    <span className="text-sm font-black text-green-700">{item.amount.toLocaleString("fr-FR")} F</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "cart" && (
          <div className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            {cartPapers.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                <ShoppingCart size={32} className="mx-auto mb-3 text-slate-200" />
                Votre panier est vide.
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {cartPapers.map(paper => (
                    <div key={paper.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black text-slate-800">{paper.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{paper.level} Â· {paper.subject}</p>
                      </div>
                      <span className="text-sm font-black text-green-700">{paper.price.toLocaleString("fr-FR")} F</span>
                      <button onClick={() => onRemoveFromCart?.(paper.id)} className="rounded-full p-2 text-slate-300 hover:bg-red-50 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">Total <span className="text-xl font-black text-slate-900">{cartTotal.toLocaleString("fr-FR")} FCFA</span></p>
                  <button onClick={onCheckoutCart} className="rounded-xl bg-green-600 px-4 py-3 text-sm font-black text-white hover:bg-green-700">
                    Valider le panier
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "profile" && (
          <div className="bg-white/85 rounded-2xl border border-white/70 p-6 space-y-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            {!isEditingProfile ? (
              <>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-sm">
                    {teacherProfile.photoUrl ? (
                      <img src={teacherProfile.photoUrl} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-600 text-white text-lg font-black">{user.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div>
                    )}
                  </div>
                  <div>
                    <h2 className="font-bold text-slate-900">Profil public</h2>
                    <p className="text-xs text-slate-400">Vue publique de votre profil enseignant. Cliquez sur Modifier pour mettre à jour.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{profileForm.fullName || user.name}</p>
                    <p className="text-xs text-slate-400">{profileForm.subject || 'Matière non renseignée'}</p>
                  </div>
                  <div className="text-right md:text-left">
                    <button onClick={() => setIsEditingProfile(true)} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-xs font-bold text-white hover:bg-green-700 transition-colors">
                      Modifier
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Contact</p>
                    <p className="text-sm text-slate-700">{profileForm.phone || 'Non renseigné'}</p>
                  <p className="text-sm text-slate-700 mt-2">{user.email}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Cycle</p>
                    <p className="text-sm text-slate-700">{profileForm.cycle || 'Non renseigné'}</p>
                    <p className="text-xs text-slate-400 mt-3 uppercase tracking-[0.2em]">Statut</p>
                    <p className="text-sm text-slate-700">{teacherProfile.schools.length > 0 ? 'Assorti à des écoles' : 'Aucune école associée'}</p>
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Biographie</p>
                  <p className="text-sm text-slate-700">{profileForm.bio || 'Aucune biographie ajoutée pour le moment.'}</p>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <button type="button" onClick={() => profilePhotoInputRef.current?.click()} className="relative">
                    <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-sm">
                      {teacherProfile.photoUrl ? (
                        <img src={teacherProfile.photoUrl} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-600 text-white text-lg font-black">{user.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div>
                      )}
                    </div>
                    <span className="absolute -bottom-1 -right-1 rounded-full bg-green-600 p-2 text-white shadow-md"><Camera size={12} /></span>
                  </button>
                  <input ref={profilePhotoInputRef} type="file" accept="image/*" className="hidden" onChange={e => setProfilePhoto(e.target.files?.[0] || null)} />
                  <div>
                    <h2 className="font-bold text-slate-900">Modifier le profil</h2>
                    <p className="text-xs text-slate-400">Mettez à jour votre photo, biographie et informations.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-xs font-semibold text-slate-500 block">
                    Nom complet
                    <input value={profileForm.fullName} onChange={e => setProfileForm(prev => ({ ...prev, fullName: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" />
                  </label>
                  <label className="text-xs font-semibold text-slate-500 block">
                    Téléphone
                    <input value={profileForm.phone} onChange={e => setProfileForm(prev => ({ ...prev, phone: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" />
                  </label>
                  <label className="text-xs font-semibold text-slate-500 block">
                    Cycle
                    <select value={profileForm.cycle} onChange={e => setProfileForm(prev => ({ ...prev, cycle: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1 bg-white">
                      <option value="">Choisir</option>
                      <option value="Collège">Collège</option>
                      <option value="Lycée">Lycée</option>
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-500 block">
                    Matière principale
                    <input value={profileForm.subject} onChange={e => setProfileForm(prev => ({ ...prev, subject: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" />
                  </label>
                  <label className="text-xs font-semibold text-slate-500 block md:col-span-2">
                    Biographie
                    <textarea value={profileForm.bio} onChange={e => setProfileForm(prev => ({ ...prev, bio: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm mt-1" rows={4} />
                  </label>
                  {false && (
                  <label className="text-xs font-semibold text-slate-500 block md:col-span-2">
                    Ajouter une école à mon profil
                    <select value="" onChange={() => undefined} className="hidden">
                      <option value="">Sélectionner une école</option>
                      {(teacherProfile.availableSchools.length > 0 ? teacherProfile.availableSchools : teacherProfile.schools).map((school) => (
                        <option key={school.id} value={school.id}>{school.name} {school.city ? `• ${school.city}` : ''}</option>
                      ))}
                    </select>
                  </label>
                  )}
                </div>
                <div className="space-y-2">
                  {profileStatus.error && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{profileStatus.error}</div>}
                  {profileStatus.success && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{profileStatus.success}</div>}
                </div>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <button onClick={saveProfile} className="w-full md:w-auto bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-xl transition-colors">Enregistrer</button>
                  <button onClick={() => {
                    setIsEditingProfile(false)
                    setProfileForm({
                      fullName: teacherProfile.profile.fullName,
                      bio: teacherProfile.profile.bio,
                      cycle: teacherProfile.profile.cycle,
                      subject: teacherProfile.profile.subject,
                      phone: teacherProfile.profile.phone,
                      schoolId: "",
                    })
                    setProfilePhoto(null)
                  }} className="w-full md:w-auto bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-xl transition-colors">Annuler</button>
                </div>
              </>
            )}
          </div>
        )}

        {tab === "upload" && (
          <div className="bg-white/85 rounded-2xl border border-white/70 p-6 space-y-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl">
            <h2 className="font-bold text-slate-900">Publier un nouveau sujet</h2>
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-green-400 hover:bg-green-50/50 transition-all cursor-pointer group"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
            >
              {uploadForm.fileName ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center text-green-600">
                    <Upload size={20} />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">{uploadForm.fileName}</p>
                  <p className="text-xs text-slate-500">Cliquez ou glissez pour remplacer ce fichier</p>
                </div>
              ) : (
                <>
                  <Upload size={24} className="text-slate-200 group-hover:text-green-400 mx-auto mb-2 transition-colors" />
                  <p className="text-sm font-semibold text-slate-400">Glissez-déposez ou sélectionnez votre fichier ici</p>
                  <p className="text-xs text-slate-300 mt-1">PDF, DOCX, XLSX, PNG, JPG, JPEG, GIF, TXT, ZIP, RAR</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              id="teacher-upload-file"
              type="file"
              accept={allowedFileTypes}
              className="hidden"
              onChange={handleFileChange}
            />
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Titre du sujet</label>
              <input
                value={uploadForm.title}
                onChange={e => updateUploadForm('title')(e.target.value)}
                type="text"
                placeholder="Ex: Sujet de maths - 1ère générale"
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1.5">Description du sujet</label>
              <textarea
                value={uploadForm.description}
                onChange={e => updateUploadForm('description')(e.target.value)}
                maxLength={descriptionMaxLength}
                placeholder="Ex: Chapitres couverts, competences evaluees, consignes particulieres..."
                rows={4}
                className="w-full resize-none border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 transition-all"
              />
              <p className="mt-1 text-right text-[10px] font-semibold text-slate-300">
                {uploadForm.description.length}/{descriptionMaxLength} caracteres
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Type sujet</label>
                <select
                  value={uploadForm.subjectType}
                  onChange={e => updateUploadForm('subjectType')(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 bg-white transition-all"
                >
                  <option value="">Selectionner</option>
                  {subjectTypes.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Classe / Niveau</label>
                <select
                  value={uploadForm.classId}
                  onChange={e => updateUploadForm('classId')(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 bg-white transition-all"
                >
                  <option value="">Sélectionner</option>
                  {classes.map(c => <option key={c.id_classe} value={c.id_classe}>{c.nom_classe}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Matière</label>
                <select
                  value={uploadForm.subjectId}
                  onChange={e => updateUploadForm('subjectId')(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 bg-white transition-all"
                >
                  <option value="">Sélectionner</option>
                  {filteredSubjects.map(s => <option key={s.id_matiere} value={s.id_matiere}>{s.nom_matiere}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Trimestre / période</label>
                <select
                  value={uploadForm.period}
                  onChange={e => updateUploadForm('period')(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 bg-white transition-all"
                >
                  <option value="">Sélectionner</option>
                  <option value="Trimestre 1">Trimestre 1</option>
                  <option value="Trimestre 2">Trimestre 2</option>
                  <option value="Trimestre 3">Trimestre 3</option>
                  <option value="Tous les trimestres">Tous les trimestres</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1.5">Prix fixe du site</label>
                <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-700">
                  {fixedSubjectPrice.toLocaleString("fr-FR")} FCFA
                </div>
                <p className="text-[10px] text-slate-300 mt-1">Le prix est défini par la plateforme.</p>
              </div>
            </div>
            {uploadStatus.error && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{uploadStatus.error}</div>}
            {uploadStatus.success && <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{uploadStatus.success}</div>}
            <button
              onClick={submitUpload}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Upload size={14} /> Publier le sujet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
