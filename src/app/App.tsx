import React, { useEffect, useRef, useState } from "react";
import { TrendingUp, Award, Download, BookOpenCheck, Building2, UserRoundCheck, ChevronLeft, ChevronRight, ShoppingCart, Trash2, X, CheckCircle } from "lucide-react";
import { AppHeader } from "./components/AppHeader";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { HeroPanel } from "./components/HeroPanel";
import { PaperCard } from "./components/PaperCard";
import { AuthModal } from "./components/AuthModal";
import { apiUrl } from "../lib/api";
import { PaymentModal } from "./components/PaymentModal";
import { StudentDashboard } from "./pages/StudentDashboard";
import { TeacherDashboard } from "./pages/TeacherDashboard";
import { SchoolDashboard } from "./pages/SchoolDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AdminNiveaux from "./pages/AdminNiveaux";
import AdminMatieres from "./pages/AdminMatieres";
import AdminNiveauMatieres from "./pages/AdminNiveauMatieres";
import { StudentProfilePage } from "./pages/StudentProfilePage";
import { ExamCatalogPage } from "./pages/ExamCatalogPage";
import { ExamDetailPage } from "./pages/ExamDetailPage";
import { StudentExamsPage } from "./pages/StudentExamsPage";
import { StudentExamSessionPage } from "./pages/StudentExamSessionPage";
import { TeacherExamsPage } from "./pages/TeacherExamsPage";
import { AuthMode, AuthUser, CatalogData, Paper, UserRole, ViewAll as View, CatalogClass, CatalogSubject, CatalogStats, PurchaseHistoryItem } from "./types";

const EMPTY_STATS: CatalogStats = { downloads: 0, teachers: 0, schools: 0, users: 0 };
const GRID_COLS = 5;
const GRID_ROWS = 3;
const ITEMS_PER_PAGE = GRID_COLS * GRID_ROWS;

export default function App() {
  const [view, setView] = useState<View>("home");
  const [authOpen, setAuthOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthMode>("login");
  const [loggedInAs, setLoggedInAs] = useState<UserRole | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [paymentPaper, setPaymentPaper] = useState<Paper | null>(null);
  const [paymentPapers, setPaymentPapers] = useState<Paper[] | null>(null);
  const [pendingPurchasePaper, setPendingPurchasePaper] = useState<Paper | null>(null);
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryItem[]>([]);
  const [cartIds, setCartIds] = useState<string[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartTransactionStatus, setCartTransactionStatus] = useState<"idle" | "processing" | "success">("idle");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [filterClass, setFilterClass] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [classesExpanded, setClassesExpanded] = useState(false);
  const [subjectsExpanded, setSubjectsExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [catalogPage, setCatalogPage] = useState(1);
  const [studentProfileId, setStudentProfileId] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [shouldRedirectTeacherAfterLogin, setShouldRedirectTeacherAfterLogin] = useState(false);
  const [shouldRedirectStudentToExams, setShouldRedirectStudentToExams] = useState(false);
  const [catalog, setCatalog] = useState<CatalogData>({
    classes: [],
    subjects: [],
    schools: [],
    papers: [],
    stats: EMPTY_STATS,
  });
  const [catalogError, setCatalogError] = useState("");
  const AUTH_STORAGE_KEY = "educonnect-auth-user";
  const CART_STORAGE_KEY_PREFIX = "educonnect-cart-";
  const protectedViews: View[] = ["student", "teacher", "school", "admin", "student-profile", "exams-catalog", "exam-detail", "exam-session", "student-exams", "teacher-exams", "create-exam"];
  const [schoolSubscriptionActive, setSchoolSubscriptionActive] = useState(false);
  const isHandlingPopState = useRef(false);
  const hasPushedInitialView = useRef(false);

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, educonnectView: view }, "", window.location.href);
    const handlePopState = (event: PopStateEvent) => {
      const previousView = event.state?.educonnectView as View | undefined;
      if (previousView) {
        isHandlingPopState.current = true;
        setView(previousView);
        setAuthOpen(false);
        setCartOpen(false);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!hasPushedInitialView.current) {
      hasPushedInitialView.current = true;
      return;
    }
    if (isHandlingPopState.current) {
      isHandlingPopState.current = false;
      return;
    }
    window.history.pushState({ ...window.history.state, educonnectView: view }, "", window.location.href);
  }, [view]);

  const getDefaultViewForRole = (role: UserRole | null): View => {
    switch (role) {
      case 'teacher': return 'teacher';
      case 'school': return 'school';
      case 'admin': return 'admin';
      default: return 'feed';
    }
  };

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (!stored) return

    let user: AuthUser
    try {
      user = JSON.parse(stored) as AuthUser
    } catch (e) {
      console.error('Impossible de restaurer la session', e)
      localStorage.removeItem(AUTH_STORAGE_KEY)
      return
    }

    fetch(apiUrl('/api/auth/me'), { credentials: 'include' })
      .then(response => {
        if (!response.ok) throw new Error('Session expirée')
        return response.json() as Promise<{ user: AuthUser }>
      })
      .then(data => {
        const currentUser = data.user || user
        setAuthUser(currentUser)
        setLoggedInAs(currentUser.role)
        setShouldRedirectTeacherAfterLogin(false)
        setView(getDefaultViewForRole(currentUser.role))
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentUser))
      })
      .catch(() => {
        localStorage.removeItem(AUTH_STORAGE_KEY)
        setAuthUser(null)
        setLoggedInAs(null)
      })
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const googleError = params.get('google_error')
    if (googleError) {
      setCatalogError(googleError)
      window.history.replaceState({ ...window.history.state, educonnectView: view }, '', window.location.pathname)
      return
    }
    if (params.get('google') !== 'success') return
    window.history.replaceState({ ...window.history.state, educonnectView: view }, '', window.location.pathname)
    fetch('/api/auth/me')
      .then(response => {
        if (!response.ok) throw new Error('Session Google introuvable')
        return response.json()
      })
      .then(data => handleLogin(data.user as AuthUser))
      .catch(error => setCatalogError(error instanceof Error ? error.message : 'Connexion Google impossible'))
  }, [])

  useEffect(() => {
    fetchCatalog();
  }, []);

  const fetchCatalog = () => {
    fetch("/api/catalog")
      .then(res => {
        if (!res.ok) throw new Error("Erreur de chargement du catalogue");
        return res.json();
      })
      .then(setCatalog)
      .catch(error => {
        console.error("Impossible de charger le catalogue", error);
        setCatalogError("Impossible de charger les donnees depuis la base.");
      });
  };

  useEffect(() => {
    if (!authUser || (authUser.role !== "student" && authUser.role !== "teacher")) return;

    fetch(`/api/student/dashboard?userId=${encodeURIComponent(authUser.id)}`)
      .then(res => {
        if (!res.ok) throw new Error("Impossible de charger les achats");
        return res.json();
      })
      .then(data => {
        setPurchasedIds(new Set(data.purchasedIds || []));
        setPurchaseHistory(data.purchases || []);
      })
      .catch(error => console.error("Impossible de charger les achats", error));
  }, [authUser?.id, authUser?.role]);

  useEffect(() => {
    if (!authUser || authUser.role !== 'school') {
      setSchoolSubscriptionActive(false);
      return;
    }
    fetch('/api/school/subscription')
      .then(res => res.ok ? res.json() : Promise.reject(new Error('Abonnement indisponible')))
      .then(data => setSchoolSubscriptionActive(Boolean(data.subscription?.active)))
      .catch(error => {
        console.error("Impossible de vérifier l'abonnement école", error);
        setSchoolSubscriptionActive(false);
      });
  }, [authUser?.id, authUser?.role]);

  useEffect(() => {
    if (!authUser) {
      setCartIds([]);
      return;
    }

    try {
      const stored = localStorage.getItem(`${CART_STORAGE_KEY_PREFIX}${authUser.id}`);
      setCartIds(stored ? JSON.parse(stored) : []);
    } catch (error) {
      console.error("Impossible de restaurer le panier", error);
      setCartIds([]);
    }
  }, [authUser?.id]);

  useEffect(() => {
    if (!authUser) return;
    localStorage.setItem(`${CART_STORAGE_KEY_PREFIX}${authUser.id}`, JSON.stringify(cartIds));
  }, [authUser?.id, cartIds]);

  useEffect(() => {
    if (!authUser || authUser.role !== 'teacher') return
    setView('teacher')
  }, [authUser?.id, authUser?.role])

  useEffect(() => {
    if (!authUser && protectedViews.includes(view)) {
      setView("home");
      setAuthOpen(true);
    }
  }, [authUser, view]);

  // Global SSE subscription: listen for catalog/stat updates and refresh catalog automatically
  useEffect(() => {
    let es: EventSource | null = null
    try {
      es = new EventSource('/api/events/global')
      es.addEventListener('catalog', (ev: any) => {
        try {
          // optional: parse payload for more specific UI updates
          fetchCatalog()
        } catch (e) {}
      })
      es.onerror = () => { es?.close(); es = null }
    } catch (e) {
      es = null
    }

    return () => { es?.close() }
  }, [])

  const handleLogin = async (user: AuthUser) => {
    setAuthUser(user);
    setLoggedInAs(user.role);
    setShouldRedirectTeacherAfterLogin(false);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    setAuthOpen(false);

    if (pendingPurchasePaper) {
      setView("feed");
      if (user.role === "student" || user.role === "teacher") {
        setCartIds(prev => prev.includes(pendingPurchasePaper.id) ? prev : [...prev, pendingPurchasePaper.id]);
        toast.success("Sujet ajoute au panier.");
      } else {
        toast("Connectez-vous avec un compte grand public pour acheter ce sujet.");
      }
      setPendingPurchasePaper(null);
      return;
    }

    if (shouldRedirectStudentToExams) {
      setShouldRedirectStudentToExams(false);
      setView(user.role === "teacher" ? "teacher-exams" : user.role === "student" ? "student-exams" : "feed");
      return;
    }

    const map: Record<UserRole, View> = { student: "student", teacher: "teacher", school: "school", admin: "admin" };
    setView(map[user.role]);
  };

  const handleLogout = () => {
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthUser(null);
    setLoggedInAs(null);
    setShouldRedirectTeacherAfterLogin(false);
    setShouldRedirectStudentToExams(false);
    setView("home");
    setPurchasedIds(new Set());
    setSavedIds(new Set());
    setPurchaseHistory([]);
    setCartIds([]);
    setCartOpen(false);
  };

  const handleEnterApp = () => {
    if (authUser) {
      setView(getDefaultViewForRole(authUser.role));
      return;
    }

    setView("feed");
  };

  const handleOpenAuth = (mode: AuthMode) => {
    setAuthModalMode(mode);
    setAuthOpen(true);
    if (mode === "register") {
      toast("Vous pouvez créer votre compte ici.");
    }
  };

  const handlePurchaseSuccess = async (items: Paper[]) => {
    if (!authUser) return;
    setPurchasedIds(prev => new Set([...prev, ...items.map(item => item.id)]));
    setCartOpen(false);
    setCartIds(prev => prev.filter(id => !items.some(item => item.id === id)));
    try {
      const response = await fetch(`/api/student/dashboard?userId=${encodeURIComponent(authUser.id)}`);
      if (!response.ok) throw new Error("Impossible de rafraîchir les achats");
      const data = await response.json();
      setPurchasedIds(new Set(data.purchasedIds || []));
      setPurchaseHistory(data.purchases || []);
    } catch (error) {
      console.error("Impossible de rafraîchir les achats", error);
    }
  };

  const { classes, subjects, schools, papers, stats } = catalog;
  const schoolHasActiveSubscription = authUser?.role === "school" && schoolSubscriptionActive;

  const schoolCatalogBlocked = authUser?.role === "school" && !schoolHasActiveSubscription;
  const filteredPapers = papers.filter(p => {
    if (schoolCatalogBlocked) return false;
    if (filterClass && p.level !== filterClass) return false;
    if (filterSubject && p.subject !== filterSubject) return false;
    if (search && !p.title.toLowerCase().includes(search.toLowerCase()) && !p.subject.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalCatalogPages = Math.max(1, Math.ceil(filteredPapers.length / ITEMS_PER_PAGE));
  const paginatedPapers = filteredPapers.slice(
    (catalogPage - 1) * ITEMS_PER_PAGE,
    catalogPage * ITEMS_PER_PAGE,
  );

  useEffect(() => {
    setCatalogPage(1);
  }, [filterClass, filterSubject, search]);

  const effectivePurchasedIds = new Set(purchasedIds);
  if (schoolHasActiveSubscription) {
    papers.forEach(paper => effectivePurchasedIds.add(paper.id));
  }

  const purchasedPapers = papers.filter(p => purchasedIds.has(p.id));
  const cartPapers = papers.filter(p => cartIds.includes(p.id) && !purchasedIds.has(p.id));
  const premiumPaperId = [...papers].sort((a, b) => b.downloads - a.downloads)[0]?.downloads > 0
    ? [...papers].sort((a, b) => b.downloads - a.downloads)[0]?.id
    : "";

  const addToCart = (paper: Paper) => {
    if (!loggedInAs) {
      setPendingPurchasePaper(paper);
      setAuthModalMode("login");
      setAuthOpen(true);
      toast("Connectez-vous ou creez un compte pour ajouter ce sujet au panier.");
      return;
    }

    if (authUser?.role !== "student" && authUser?.role !== "teacher") {
      setPaymentPaper(paper);
      return;
    }

    if (purchasedIds.has(paper.id)) {
      toast("Ce sujet est deja disponible dans vos achats.");
      return;
    }

    setCartIds(prev => prev.includes(paper.id) ? prev : [...prev, paper.id]);
    toast.success("Sujet ajoute au panier.");
  };

  const removeFromCart = (paperId: string) => {
    setCartIds(prev => prev.filter(id => id !== paperId));
  };

  const checkoutCart = async () => {
    if (cartPapers.length === 0) {
      toast("Votre panier est vide.");
      return;
    }

    const items = [...cartPapers];
    setCartOpen(false);
    setCartTransactionStatus("idle");
    setPaymentPaper(null);
    setPaymentPapers(items);
  };

  if (view === "home") {
    return (
      <div className="landing-page min-h-screen relative overflow-hidden">
        <Toaster />
        <main className="relative mx-auto max-w-7xl px-4 py-8 sm:py-10 lg:py-16">
          <section className="grid items-center gap-8 lg:grid-cols-[1.08fr_0.92fr] lg:gap-10">
            <div className="space-y-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white/90 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-950 shadow-sm backdrop-blur animate-[fadeIn_0.8s_ease-out]">
                <Award size={14} className="text-amber-600" /> EduConnect Congo
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-[minmax(6.5rem,0.8fr)_minmax(0,2fr)] items-center gap-3 sm:grid-cols-[minmax(9rem,0.9fr)_minmax(0,2fr)] sm:gap-4">
                  <img
                    src="/eleve-accueil.png"
                    alt="Élève souriante tenant ses cahiers"
                    className="mx-auto h-40 w-full object-contain sm:h-56 lg:h-80"
                  />
                  <h1 className="landing-title text-[1.65rem] text-[#173b32] leading-[1.04] sm:text-5xl lg:text-6xl animate-[fadeInUp_0.9s_ease-out]">
                    Les bons sujets, au bon niveau.
                  </h1>
                </div>
                <p className="max-w-2xl text-base leading-7 text-slate-700 sm:text-lg sm:leading-8 animate-[fadeInUp_1.1s_ease-out]">
                  Révisez avec des ressources classées par niveau, matière et trimestre. Enseignants, écoles et familles partagent ici des sujets pour progresser.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 animate-[fadeInUp_1.3s_ease-out]">
                <button onClick={handleEnterApp} className="rounded-lg bg-emerald-800 px-6 py-3.5 text-sm font-black text-white shadow-[0_12px_28px_rgba(6,78,59,0.2)] transition-all hover:-translate-y-0.5 hover:bg-emerald-900">
                  Parcourir les sujets
                </button>
                <button onClick={() => handleOpenAuth("register")} className="rounded-lg border border-slate-300 bg-white/90 px-6 py-3.5 text-sm font-black text-slate-800 shadow-sm transition-all hover:border-amber-500 hover:text-emerald-900">
                  Créer un compte
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Connexion rapide", value: "01" },
                  { label: "Téléchargement simple", value: "02" },
                  { label: "Publication directe", value: "03" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-amber-300 hover:shadow-md">
                    <p className="text-lg font-black text-amber-700">{item.value}</p>
                    <p className="text-sm text-slate-600">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative animate-[fadeInRight_1s_ease-out]">
              <div className="relative overflow-hidden rounded-xl border border-white/80 bg-white/90 shadow-[0_24px_70px_rgba(23,59,50,0.2)] backdrop-blur-xl transition-transform duration-500 hover:-translate-y-1">
                <div
                  className="relative min-h-[470px] overflow-hidden bg-cover bg-center sm:rounded-xl"
                  style={{
                    backgroundImage: "linear-gradient(135deg, rgba(15, 39, 33, 0.78), rgba(15, 63, 53, 0.34)), url('/livres.jpg')",
                  }}
                >
                  <div className="relative flex min-h-[470px] flex-col justify-between gap-8 p-5 text-white sm:p-7">
                    <div className="flex items-center justify-between">
                      <div className="rounded-full border border-white/25 bg-emerald-950/30 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white backdrop-blur-sm">
                        Nouveau parcours
                      </div>
                      <div className="rounded-lg bg-slate-950/30 px-3 py-2 text-right ring-1 ring-white/20 backdrop-blur-sm">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-white/85">En ligne</p>
                        <p className="text-lg font-black">24/7</p>
                      </div>
                    </div>

                    <div>
                      <h2 className="max-w-sm text-3xl font-black leading-tight sm:text-4xl">Une expérience pensée pour chaque profil.</h2>
                      <div className="mt-5 grid gap-3">
                        {[
                          "Enseignant : publication directe, sans dépendre d’une école.",
                          "École : accès aux contenus et téléchargement global.",
                          "Grand public : consultation et achat des sujets.",
                        ].map((item) => (
                          <div key={item} className="rounded-lg border border-white/20 bg-slate-950/35 px-3 py-3 text-sm font-semibold text-white backdrop-blur-sm">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-white/20 bg-slate-950/30 p-4 backdrop-blur-sm">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-100">Plateforme sécurisée</p>
                        <p className="mt-2 text-xl font-black">100% moderne</p>
                      </div>
                      <div className="rounded-lg border border-amber-200/50 bg-amber-700/35 p-4 backdrop-blur-sm">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-100">Accès rapide</p>
                        <p className="mt-2 text-xl font-black">Souscription + achat</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-4 sm:mt-12 md:grid-cols-3">
            {[
              { title: "Ressources triées", desc: "Trouvez rapidement les bons sujets par niveau et matière." },
              { title: "Expérience fluide", desc: "Une interface simple, claire et pensée pour gagner du temps." },
              { title: "Accès maîtrisé", desc: "Chaque profil voit exactement ce qu’il doit voir." },
            ].map((card) => (
              <div key={card.title} className="rounded-lg border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-amber-300 hover:shadow-lg">
                <h3 className="text-lg font-black text-[#173b32]">{card.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{card.desc}</p>
              </div>
            ))}
          </section>

          <section className="mt-16 sm:mt-20">
            <div className="mx-auto mb-8 max-w-2xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Apprendre ensemble</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                La lecture ouvre de nouveaux horizons.
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">
                Lire, réviser et partager ses connaissances : chaque moment compte pour progresser.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  image: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=900&q=80",
                  alt: "Un élève qui travaille sur un exercice écrit pour réviser",
                  caption: "Des sujets pour mieux se préparer",
                },
                {
                  image: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=900&q=80",
                  alt: "Une classe d’élèves en cours, à différents niveaux",
                  caption: "Choisissez selon votre niveau",
                },
                {
                  image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80",
                  alt: "Une personne qui consulte des ressources sur un ordinateur portable",
                  caption: "Accédez aux sujets en quelques clics",
                },
                {
                  image: "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=900&q=80",
                  alt: "Des livres ouverts et des notes pour réviser",
                  caption: "Des ressources utiles pour réussir",
                },
              ].map((item) => (
                <figure
                  key={item.caption}
                  className="group relative h-64 overflow-hidden rounded-lg bg-slate-200 shadow-md ring-1 ring-black/5 sm:h-72"
                >
                  <img
                    src={item.image}
                    alt={item.alt}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/15 to-transparent" />
                  <figcaption className="absolute inset-x-0 bottom-0 p-5 text-lg font-black text-white">
                    {item.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>

          <footer className="mt-14 border-t border-emerald-200/70 py-7 sm:mt-20 sm:py-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="" className="h-11 w-11 rounded-xl object-cover" />
                <div>
                  <p className="font-black text-slate-900">EduConnect Congo</p>
                  <p className="mt-0.5 text-sm text-slate-500">Les bons sujets pour mieux se préparer.</p>
                </div>
              </div>
              <nav aria-label="Liens de pied de page" className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-bold text-slate-600">
                <button type="button" onClick={handleEnterApp} className="transition-colors hover:text-green-700">
                  Parcourir les sujets
                </button>
                <button type="button" onClick={() => handleOpenAuth("register")} className="transition-colors hover:text-green-700">
                  Créer un compte
                </button>
                <button type="button" onClick={() => handleOpenAuth("login")} className="transition-colors hover:text-green-700">
                  Se connecter
                </button>
              </nav>
            </div>
            <p className="mt-6 border-t border-slate-200/70 pt-5 text-xs text-slate-400">
              © {new Date().getFullYear()} EduConnect Congo. Tous droits réservés.
            </p>
          </footer>
        </main>
        {authOpen && <AuthModal initialMode={authModalMode} onClose={() => { setAuthOpen(false); setShouldRedirectStudentToExams(false); }} onLogin={handleLogin} schools={schools} />}
      </div>
    );
  }

  if (view === "student" && loggedInAs === "student" && authUser) {
    return (
      <>
        <StudentDashboard purchasedPapers={purchasedPapers} cartPapers={cartPapers} onRemoveFromCart={removeFromCart} onCheckoutCart={checkoutCart} onLogout={handleLogout} onFeed={() => setView("feed")} onExamCatalog={() => setView("student-exams")} user={authUser} onViewProfile={() => { setStudentProfileId(authUser.id); setView('student-profile') }} />
        {(paymentPaper || paymentPapers) && <PaymentModal userId={authUser?.id || ""} paper={paymentPaper || undefined} papers={paymentPapers || undefined} onClose={() => { setPaymentPaper(null); setPaymentPapers(null); }} onSuccess={handlePurchaseSuccess} />}
      </>
    );
  }

  if (view === "student-profile" && studentProfileId) {
    return <StudentProfilePage studentId={studentProfileId} onBack={() => setView("student")} />;
  }

  if (view === "teacher" && loggedInAs === "teacher" && authUser) {
    return <TeacherDashboard onLogout={handleLogout} onFeed={() => setView("feed")} onTeacherExams={() => setView("teacher-exams")} classes={classes} subjects={subjects} user={authUser} purchasedPapers={purchasedPapers} purchaseHistory={purchaseHistory} cartPapers={cartPapers} onRemoveFromCart={removeFromCart} onCheckoutCart={checkoutCart} />;
  }

  if (view === "school" && loggedInAs === "school" && authUser) {
    return <SchoolDashboard onLogout={handleLogout} onFeed={() => {
      fetch('/api/school/subscription')
        .then(res => res.ok ? res.json() : Promise.reject(new Error('Abonnement indisponible')))
        .then(data => setSchoolSubscriptionActive(Boolean(data.subscription?.active)))
        .catch(() => setSchoolSubscriptionActive(false));
      setView("feed");
    }} user={authUser} onCatalogRefresh={fetchCatalog} />;
  }

  if (view === "admin" && loggedInAs === "admin" && authUser) {
    return <AdminDashboard onLogout={handleLogout} onFeed={() => setView("feed")} user={authUser} onCatalogRefresh={fetchCatalog} setView={(nextView) => setView(nextView as View)} />;
  }

  if (view === 'admin-niveaux' && loggedInAs === 'admin' && authUser) {
    return <AdminNiveaux onBack={() => setView('admin')} setView={(nextView) => setView(nextView as View)} />;
  }

  if (view === 'admin-matieres' && loggedInAs === 'admin' && authUser) {
    return <AdminMatieres onBack={() => setView('admin')} setView={(nextView) => setView(nextView as View)} />;
  }

  if (view === 'admin-niveau-matieres' && loggedInAs === 'admin' && authUser) {
    return <AdminNiveauMatieres onBack={() => setView('admin')} />;
  }

  if (view === "exams-catalog" && loggedInAs === "student" && authUser) {
    return (
      <ExamCatalogPage
        onLogout={handleLogout}
        onFeed={() => setView("feed")}
        onExamCatalog={() => setView("student-exams")}
        user={authUser}
        onSelect={(exam) => {
          setSelectedExamId(exam.id_examen);
          setView("exam-detail");
        }}
      />
    );
  }

  if (view === "exam-detail" && selectedExamId && authUser) {
    return <ExamDetailPage onLogout={handleLogout} onFeed={() => setView("student-exams")} user={authUser} examId={selectedExamId} />;
  }

  if (view === "exam-session" && selectedExamId && authUser) {
    return <StudentExamSessionPage onLogout={handleLogout} onBack={() => setView("student-exams")} user={authUser} examId={selectedExamId} />;
  }

  if (view === "student-exams" && loggedInAs === "student" && authUser) {
    return <StudentExamsPage
      onLogout={handleLogout}
      onFeed={() => setView("feed")}
      onExamCatalog={() => setView("student-exams")}
      onSelectExam={exam => { setSelectedExamId(exam.id_examen); setView("exam-detail"); }}
      onOpenSession={exam => { setSelectedExamId(exam.id_examen); setView("exam-session"); }}
      user={authUser}
    />;
  }

  if (view === "teacher-exams" && loggedInAs === "teacher" && authUser) {
    return <TeacherExamsPage onLogout={handleLogout} onFeed={() => setView("feed")} onTeacherSubjects={() => setView("teacher")} onTeacherExams={() => setView("teacher-exams")} user={authUser} classes={classes} subjects={subjects} />;
  }

  if (view === "create-exam" && loggedInAs === "teacher" && authUser) {
    return <TeacherExamsPage onLogout={handleLogout} onFeed={() => setView("feed")} onTeacherSubjects={() => setView("teacher")} onTeacherExams={() => setView("teacher-exams")} user={authUser} classes={classes} subjects={subjects} />;
  }

  return (
    <div className="app-shell min-h-screen">
      <AppHeader
        search={search}
        setSearch={setSearch}
        loggedInAs={loggedInAs}
        authUser={authUser}
        setView={setView}
        onOpenAuth={handleOpenAuth}
        onOpenExams={() => {
          setShouldRedirectStudentToExams(true);
          handleOpenAuth("login");
        }}
        cartCount={cartPapers.length}
        onOpenCart={() => setCartOpen(true)}
      />

      <Toaster />

      <HeroPanel
        stats={stats}
        onExamOnline={() => {
          if (loggedInAs === "teacher") {
           setView("teacher-exams");
          } else if (loggedInAs === "student") {
            setView("student-exams");
          } else {
            setShouldRedirectStudentToExams(true);
            handleOpenAuth("login");
          }
        }}
      />

      <div className="max-w-[1400px] mx-auto px-4 py-8">
        <div className="flex flex-col gap-4">
          <aside className="w-full">
            <div className="surface-card grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
              <div>
                <button type="button" aria-expanded={classesExpanded} onClick={() => setClassesExpanded(open => !open)} className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700">
                  <span>Niveau{filterClass ? ` : ${filterClass}` : ""}</span>
                  <svg className={`h-4 w-4 transition-transform ${classesExpanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                </button>
                {classesExpanded && <div className="mt-1 max-h-52 space-y-0.5 overflow-y-auto border-l-2 border-emerald-100 pl-2">
                  <button type="button" onClick={() => setFilterClass("")} className={`w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${filterClass === "" ? "bg-emerald-50 font-bold text-emerald-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>Tous les niveaux</button>
                  {classes.map(c => <button key={c.id_classe} type="button" onClick={() => setFilterClass(filterClass === c.nom_classe ? "" : c.nom_classe)} className={`w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${filterClass === c.nom_classe ? "bg-emerald-50 font-bold text-emerald-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>{c.nom_classe}</button>)}
                </div>}
              </div>
              <div>
                <button type="button" aria-expanded={subjectsExpanded} onClick={() => setSubjectsExpanded(open => !open)} className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-[11px] font-black uppercase tracking-wider text-slate-500 transition-colors hover:bg-emerald-50 hover:text-emerald-700">
                  <span>Matière{filterSubject ? ` : ${filterSubject}` : ""}</span>
                  <svg className={`h-4 w-4 transition-transform ${subjectsExpanded ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
                </button>
                {subjectsExpanded && <div className="mt-1 max-h-52 space-y-0.5 overflow-y-auto border-l-2 border-emerald-100 pl-2">
                  <button type="button" onClick={() => setFilterSubject("")} className={`w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${filterSubject === "" ? "bg-emerald-50 font-bold text-emerald-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>Toutes les matières</button>
                  {subjects.map(s => <button key={s.id_matiere} type="button" onClick={() => setFilterSubject(filterSubject === s.nom_matiere ? "" : s.nom_matiere)} className={`w-full rounded-lg px-2 py-1.5 text-left text-xs font-medium transition-colors ${filterSubject === s.nom_matiere ? "bg-emerald-50 font-bold text-emerald-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}>{s.nom_matiere}</button>)}
                </div>}
              </div>
            </div>
          </aside>

          <main className="w-full min-w-0">
            <div className="surface-card mb-5 px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">
                <span className="font-black text-slate-900">{schoolCatalogBlocked ? 0 : filteredPapers.length}</span> sujet{schoolCatalogBlocked || filteredPapers.length !== 1 ? "s" : ""} disponible{schoolCatalogBlocked || filteredPapers.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-green-700 font-black bg-green-50 px-3 py-1.5 rounded-full">
                <TrendingUp size={12} /> {schoolCatalogBlocked ? "Abonnement requis" : "Plus populaires"}
              </div>
            </div>

            <div>
              {schoolCatalogBlocked ? (
                <div className="surface-card p-10 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                    <Download size={28} />
                  </div>
                  <p className="text-lg font-black text-slate-900">Abonnement non valide</p>
                  <p className="mt-2 text-sm text-slate-500">Votre accès aux sujets est bloqué tant que l’abonnement de votre école n’est pas actif. Les sujets déjà téléchargés restent visibles dans votre tableau de bord.</p>
                </div>
              ) : filteredPapers.length === 0 ? (
                <div className="surface-card p-10 text-center">
                  <Download size={32} className="text-green-200 mx-auto mb-3" />
                  <p className="text-slate-400 font-medium text-sm">Aucun sujet trouvé</p>
                  <button onClick={() => { setFilterClass(""); setFilterSubject(""); setSearch(""); }} className="mt-2 text-green-600 text-sm font-semibold hover:underline">
                    Réinitialiser les filtres
                  </button>
                </div>
              ) : (
                <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 auto-rows-fr">
                {paginatedPapers.map(p => (
                  <PaperCard
                    key={p.id}
                    paper={p}
                    onBuy={paper => {
                      if (loggedInAs === "school" && !schoolHasActiveSubscription) {
                        toast.error("Abonnement non valide. Activez votre abonnement pour accéder aux sujets.");
                        return;
                      }
                      if (loggedInAs === "school" && schoolHasActiveSubscription) {
                        const schoolStorageKey = `educonnect-school-downloads-${authUser?.id ?? ""}`;
                        if (authUser?.id) {
                          const stored = localStorage.getItem(schoolStorageKey);
                          const current = stored ? JSON.parse(stored) as string[] : [];
                          const next = Array.from(new Set([...current, paper.id]));
                          localStorage.setItem(schoolStorageKey, JSON.stringify(next));
                        }
                        const link = document.createElement("a");
                        if (paper.fileUrl) {
                          link.href = paper.fileUrl;
                          link.target = "_blank";
                          link.rel = "noopener noreferrer";
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }
                        return;
                      }
                      if (!loggedInAs) {
                        setPendingPurchasePaper(paper);
                        setAuthModalMode("login");
                        setAuthOpen(true);
                        toast("Connectez-vous ou creez un compte pour finaliser l'achat.");
                        return;
                      }
                      addToCart(paper);
                    }}
                    isPurchased={effectivePurchasedIds.has(p.id)}
                    isPremium={p.id === premiumPaperId}
                    isSaved={savedIds.has(p.id)}
                    onSave={id => setSavedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id); else next.add(id);
                      return next;
                    })}
                  />
                ))}
                </div>

                {totalCatalogPages > 1 && (
                  <div className="mt-5 flex items-center justify-between gap-3 surface-card px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setCatalogPage(p => Math.max(1, p - 1))}
                      disabled={catalogPage === 1}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:border-green-400 hover:text-green-700 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      <ChevronLeft size={14} /> Precedent
                    </button>
                    <p className="text-xs text-slate-500 font-semibold">
                      Page <span className="font-black text-slate-900">{catalogPage}</span> sur{" "}
                      <span className="font-black text-slate-900">{totalCatalogPages}</span>
                      <span className="hidden sm:inline text-slate-400"> · {filteredPapers.length} sujet{filteredPapers.length !== 1 ? "s" : ""}</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => setCatalogPage(p => Math.min(totalCatalogPages, p + 1))}
                      disabled={catalogPage === totalCatalogPages}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition-colors hover:border-green-400 hover:text-green-700 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      Suivant <ChevronRight size={14} />
                    </button>
                  </div>
                )}
                </>
              )}
            </div>
          </main>

        </div>
      </div>

      {authOpen && <AuthModal initialMode={authModalMode} onClose={() => { setAuthOpen(false); setShouldRedirectStudentToExams(false); }} onLogin={handleLogin} schools={schools} />}
      {cartOpen && authUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-900">
                <ShoppingCart size={18} />
                <p className="font-black">Mon panier</p>
              </div>
              <button
                onClick={() => cartTransactionStatus === "idle" && setCartOpen(false)}
                disabled={cartTransactionStatus !== "idle"}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {cartTransactionStatus === "processing" ? (
                <div className="rounded-xl border border-green-100 bg-green-50 p-6 text-center">
                  <div className="mx-auto mb-3 h-8 w-8 rounded-full border-4 border-green-500 border-t-transparent animate-spin" />
                  <p className="text-sm font-black text-green-700">Transaction en cours</p>
                  <p className="mt-1 text-xs text-green-600/70">Veuillez patienter pendant la validation de votre panier.</p>
                </div>
              ) : cartTransactionStatus === "success" ? (
                <div className="rounded-xl border border-green-100 bg-green-50 p-6 text-center">
                  <CheckCircle size={34} className="mx-auto mb-3 text-green-600" />
                  <p className="text-sm font-black text-green-700">Transaction reussie</p>
                  <p className="mt-1 text-xs text-green-600/70">Vos sujets sont maintenant disponibles dans votre compte.</p>
                </div>
              ) : cartPapers.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Votre panier est vide.</p>
              ) : cartPapers.map(paper => (
                <div key={paper.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-slate-800">{paper.title}</p>
                    <p className="text-xs text-slate-500">{paper.level} · {paper.subject}</p>
                  </div>
                  <button onClick={() => removeFromCart(paper.id)} className="rounded-full p-2 text-slate-300 hover:bg-red-50 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            {cartPapers.length > 0 && cartTransactionStatus === "idle" && (
              <button onClick={checkoutCart} className="mt-4 w-full rounded-xl bg-green-600 py-3 text-sm font-black text-white hover:bg-green-700">
                Valider le panier
              </button>
            )}
          </div>
        </div>
      )}
      {(paymentPaper || paymentPapers) && <PaymentModal userId={authUser?.id || ""} paper={paymentPaper || undefined} papers={paymentPapers || undefined} onClose={() => { setPaymentPaper(null); setPaymentPapers(null); }} onSuccess={handlePurchaseSuccess} />}
    </div>
  );
}
