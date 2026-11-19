import React, { useEffect, useState } from "react";
import { X, ArrowRight, Lock, Phone, User, Building2, Shield, BookOpen, GraduationCap, Mail, Eye, EyeOff } from "lucide-react";
import { AuthMode, AuthRole, AuthUser, CatalogSchool } from "../types";
import { FormField } from "./FormField";
import { apiUrl } from "../../lib/api";

export function AuthModal({
  onClose,
  onLogin,
  schools,
  initialMode = "login",
  initialError = "",
}: {
  onClose: () => void;
  onLogin: (user: AuthUser) => void;
  schools: CatalogSchool[];
  initialMode?: AuthMode;
  initialError?: string;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<AuthRole>("student");
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const initialForm = {
    identifier: "",
    email: "",
    password: "",
    confirmPassword: "",
    newPassword: "",
    fullName: "",
    schoolId: "",
    schoolIds: [] as string[],
    schoolName: "",
    agrement: "",
    phone: "",
    mainSubject: "",
    cycle: "College",
    city: "Brazzaville",
    otpCode: "",
  };
  const [form, setForm] = useState(initialForm);
  const [otpFor, setOtpFor] = useState<string>("");
  const [otpPurpose, setOtpPurpose] = useState<"register" | "reset" | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);

  const updateForm = (key: keyof typeof form) => (value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
    setError("");
  };

  const toggleSchool = (schoolId: string) => {
    setForm(prev => ({
      ...prev,
      schoolIds: prev.schoolIds.includes(schoolId)
        ? prev.schoolIds.filter(id => id !== schoolId)
        : [...prev.schoolIds, schoolId],
    }));
    setError("");
  };

  const passwordField = (key: "password" | "confirmPassword" | "newPassword", label: string, placeholder: string) => (
    <div className="relative">
      <FormField label={label} icon={<Lock size={14} />} placeholder={placeholder} value={form[key]} onChange={updateForm(key)} type={visiblePasswords[key] ? "text" : "password"} />
      <button
        type="button"
        aria-label={visiblePasswords[key] ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        title={visiblePasswords[key] ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        onClick={() => setVisiblePasswords(prev => ({ ...prev, [key]: !prev[key] }))}
        className="absolute right-3 top-8 p-1 text-slate-400 hover:text-green-600"
      >
        {visiblePasswords[key] ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );

  const parseJsonResponse = async (response: Response) => {
    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      return response.json();
    }

    const text = await response.text();
    if (!text) {
      throw new Error("Le serveur a renvoye une reponse vide.");
    }

    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
      throw new Error("Le serveur d’authentification n’est pas disponible. Demarrez l’API backend et reessayez.");
    }

    throw new Error(text.slice(0, 180) || "Erreur inconnue du serveur");
  };

  const requestOtp = async (purpose: "register" | "reset") => {
    const target = (purpose === "reset" ? form.identifier || form.phone : form.phone).trim();
    if (!target) {
      setError("Veuillez renseigner votre numero de telephone.");
      return false;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/auth/request-otp"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(purpose === "reset"
          ? target.includes("@") ? { email: target, purpose } : { phone: target, purpose }
          : { phone: target, purpose }),
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || "Impossible d’envoyer le code");
      setOtpFor(target);
      setOtpPurpose(purpose);
      setInfo(purpose === "register"
        ? "Un code de verification a ete envoye par WhatsApp. Entrez-le pour finaliser l’inscription."
        : target.includes("@")
          ? "Un code de verification a ete envoye par email. Entrez-le pour confirmer votre reinitialisation."
          : "Un code de verification a ete envoye par WhatsApp. Entrez-le pour confirmer votre reinitialisation.");
      if (data.devCode) {
        setInfo((prev) => `${prev} Code de test: ${data.devCode}`);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const startGoogleAuth = () => {
    setError("");
    setLoading(true);
    const query = new URLSearchParams({ mode, role });
    window.location.assign(apiUrl(`/api/auth/google/start?${query.toString()}`));
  };

  const submitAuth = async () => {
    setLoading(true);
    setError("");

    try {
      if (mode === "login") {
        const identifier = form.identifier.trim();
        const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
        const looksLikePhone = /^\+?[\d\s().-]+$/.test(identifier) && identifier.replace(/\D/g, "").length >= 6;

        if (loginMethod === "email" && !looksLikeEmail) {
          setError("Veuillez saisir une adresse email valide pour vous connecter avec email.");
          return;
        }
        if (loginMethod === "phone" && !looksLikePhone) {
          setError("Veuillez saisir un numéro de téléphone valide pour vous connecter avec téléphone.");
          return;
        }
        if (!form.password) {
          setError("Veuillez renseigner votre mot de passe.");
          return;
        }
      }

      if (mode === "register") {
        const phone = form.phone.trim();
        if (role === "school" && !form.schoolName.trim()) {
          setError("Le nom de l’établissement est requis.");
          return;
        }
        if (role !== "school" && !form.fullName.trim()) {
          setError("Votre nom complet est requis.");
          return;
        }
        if (!phone) {
          setError("Le numéro de téléphone est requis.");
          return;
        }
        if (form.password.length < 8) {
          setError("Le mot de passe doit contenir au moins 8 caractères.");
          return;
        }
        if (form.password !== form.confirmPassword) {
          setError("Les deux mots de passe doivent être identiques.");
          return;
        }
      }

      if (mode === "forgot") {
        const phone = (form.identifier || form.phone).trim();
        if (otpFor !== phone || otpPurpose !== "reset") {
          const sent = await requestOtp("reset");
          if (!sent) return;
          return;
        }
        if (!form.otpCode.trim() || !form.newPassword) {
          setError("Le code et le nouveau mot de passe sont requis.");
          return;
        }
      }

      if (mode === "forgot") {
        const resetTarget = form.identifier.trim();
        const phone = resetTarget.includes("@") ? "" : resetTarget;
        const email = resetTarget.includes("@") ? resetTarget : "";
        const response = await fetch(apiUrl("/api/auth/reset"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, email, otp: form.otpCode, password: form.newPassword }),
        });
        const data = await parseJsonResponse(response);
        if (!response.ok) throw new Error(data.error || "Impossible de reinitialiser le mot de passe");
        setInfo("Mot de passe reinitialise. Vous pouvez maintenant vous connecter.");
        setMode("login");
        setForm(initialForm);
        setOtpFor("");
        setOtpPurpose(null);
        return;
      }

      const endpoint = apiUrl(mode === "login" ? "/api/auth/login" : "/api/auth/register");
      const payload = mode === "login"
        ? { identifier: form.identifier, password: form.password }
        : { ...form, role, otp: form.otpCode };

      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await parseJsonResponse(response);

      if (!response.ok) throw new Error(data.error || "Impossible de traiter la demande");

      if (mode === 'register' && role === 'school') {
        setInfo("Compte créé. Votre établissement peut maintenant accéder à son espace.");
        setForm(initialForm);
        setMode("login");
        setOtpFor("");
        setOtpPurpose(null);
        onLogin(data.user);
        return;
      }

      if (mode === 'register' && role === 'teacher') {
        setInfo("Compte créé. Vous pouvez maintenant compléter votre profil et publier vos sujets.");
        setForm(initialForm);
        setMode("login");
        setOtpFor("");
        setOtpPurpose(null);
        onLogin(data.user)
        return
      }

      onLogin(data.user);
      setForm(initialForm);
      setOtpFor("");
      setOtpPurpose(null);
      setMode("login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17241f]/55 backdrop-blur-sm p-4">
      <div className="auth-dialog w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-hidden flex flex-col">
        <div className="bg-[#174b39] px-6 pt-6 pb-5 relative">
          <button onClick={() => { setForm(initialForm); setError(""); setInfo(""); setMode("login"); onClose(); }} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-white/20 transition-colors">
            <X size={16} className="text-white" />
          </button>
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <BookOpen size={15} className="text-emerald-800" />
            </div>
            <span className="font-black text-lg text-white">EduConnect Congo</span>
          </div>
          <div className="flex gap-1 bg-white/20 rounded-xl p-1">
            {(["login", "register"] as AuthMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-1.5 text-sm font-bold rounded-lg transition-all ${mode === m ? "bg-white text-emerald-900" : "text-white/75 hover:text-white"}`}
              >
                {m === "login" ? "Connexion" : "Inscription"}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto overscroll-contain">
          {mode === "register" && (
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Type de compte</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { r: "student" as AuthRole, label: "Grand public", Icon: GraduationCap },
                  { r: "teacher" as AuthRole, label: "Enseignant", Icon: User },
                  { r: "school" as AuthRole, label: "Ecole", Icon: Building2 },
                ]).map(({ r, label, Icon }) => (
                  <button
                    key={r}
                    onClick={() => { setRole(r); setError(""); }}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition-all ${role === r ? "border-emerald-800 bg-emerald-50 text-emerald-900" : "border-slate-100 text-slate-500 hover:border-amber-300 hover:text-slate-700"}`}
                  >
                    <Icon size={18} />
                    <span className="text-[11px] font-bold">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "login" && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Se connecter avec</p>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: "email" as const, label: "Email", icon: <Mail size={14} /> },
                    { key: "phone" as const, label: "Téléphone", icon: <Phone size={14} /> },
                  ]).map(({ key, label, icon }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setLoginMethod(key)}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition-all ${loginMethod === key ? "border-emerald-800 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:text-slate-800"}`}
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {loginMethod === "email" ? (
                <FormField label="Email" icon={<Mail size={14} />} placeholder="votre@email.cg" value={form.identifier} onChange={updateForm("identifier")} type="email" />
              ) : (
                <FormField label="Téléphone" icon={<Phone size={14} />} placeholder="+242 06 XXX XX XX" value={form.identifier} onChange={updateForm("identifier")} type="tel" />
              )}

              {passwordField("password", "Mot de passe", "********")}
              <button type="button" onClick={startGoogleAuth} disabled={loading} className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
                <GoogleMark /> {loading ? "Redirection vers Google…" : "Continuer avec Google"}
              </button>
              <div className="text-right">
                <button onClick={() => { setMode('forgot'); setError(''); setInfo(''); }} className="text-sm text-green-600 font-semibold">Mot de passe oublié ?</button>
              </div>
            </div>
          )}

          {mode === "register" && role === "student" && (
            <div className="space-y-3">
              <FormField label="Nom complet" icon={<User size={14} />} placeholder="Prenom et Nom" value={form.fullName} onChange={updateForm("fullName")} />
              <FormField label="Telephone" icon={<Phone size={14} />} placeholder="+242 06 XXX XX XX" value={form.phone} onChange={updateForm("phone")} type="tel" />
              <FormField label="Email (facultatif)" icon={<Mail size={14} />} placeholder="public@email.cg" value={form.email} onChange={updateForm("email")} type="email" />
              {passwordField("password", "Mot de passe", "Votre mot de passe")}
              {passwordField("confirmPassword", "Confirmer le mot de passe", "Retapez votre mot de passe")}
            </div>
          )}

          {mode === 'forgot' && (
            <div className="space-y-3">
              <FormField label="Telephone ou email" icon={<Phone size={14} />} placeholder="+242 06 XXX XX XX ou email" value={form.identifier} onChange={updateForm("identifier")} type="text" />
              {otpFor && otpPurpose === "reset" && (
                <FormField label="Code de verification" icon={<Shield size={14} />} placeholder="123456" value={form.otpCode} onChange={updateForm("otpCode")} />
              )}
              {passwordField("newPassword", "Nouveau mot de passe", "Votre nouveau mot de passe")}
              <p className="text-xs text-slate-500">Un code vous sera envoyé. Saisissez-le avec votre nouveau mot de passe, puis cliquez sur le bouton ci-dessous.</p>
            </div>
          )}

          {mode === "register" && role === "teacher" && (
            <div className="space-y-3">
              <FormField label="Nom complet" icon={<User size={14} />} placeholder="Prenom et Nom" value={form.fullName} onChange={updateForm("fullName")} />
              <FormField label="Telephone" icon={<Phone size={14} />} placeholder="+242 06 XXX XX XX" value={form.phone} onChange={updateForm("phone")} type="tel" />
              <FormField label="Email (facultatif)" icon={<Mail size={14} />} placeholder="enseignant@email.cg" value={form.email} onChange={updateForm("email")} type="email" />
              <label className="text-xs font-semibold text-slate-500 block">
                Cycles enseignés
                <div className="mt-1 space-y-2 rounded-xl border border-slate-200 p-3">
                  {['Primaire', 'Collège', 'Lycée général', 'Lycée technique'].map(cycle => {
                    const selected = form.cycle.split(',').map(value => value.trim()).filter(Boolean).includes(cycle);
                    return <label key={cycle} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={selected} onChange={() => updateForm("cycle")(
                        selected ? form.cycle.split(',').map(value => value.trim()).filter(value => value && value !== cycle).join(', ') : [...form.cycle.split(',').map(value => value.trim()).filter(Boolean), cycle].join(', ')
                      )} />
                      <span>{cycle}</span>
                    </label>;
                  })}
                </div>
              </label>
              <FormField label="Matières enseignées" icon={<BookOpen size={14} />} placeholder="Mathématiques, Français, Physique" value={form.mainSubject} onChange={updateForm("mainSubject")} />
              <label className="text-xs font-semibold text-slate-500 block">
                Écoles associées (facultatif)
                <div className="mt-1 max-h-32 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
                  {schools.length === 0 ? <p className="text-xs text-slate-400">Aucune école disponible</p> : schools.map(school => (
                    <label key={school.id_etablissement} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={form.schoolIds.includes(school.id_etablissement)} onChange={() => toggleSchool(school.id_etablissement)} />
                      <span className="min-w-0 truncate">{school.nom_etablissement}</span>
                    </label>
                  ))}
                </div>
              </label>
              {passwordField("password", "Mot de passe", "Votre mot de passe")}
              {passwordField("confirmPassword", "Confirmer le mot de passe", "Retapez votre mot de passe")}
            </div>
          )}

          {mode === "register" && role === "school" && (
            <div className="space-y-3">
              <FormField label="Nom de l'etablissement" icon={<Building2 size={14} />} placeholder="Ex: Lycee de la Paix" value={form.schoolName} onChange={updateForm("schoolName")} />
              <FormField label="Telephone" icon={<Phone size={14} />} placeholder="+242 06 XXX XX XX" value={form.phone} onChange={updateForm("phone")} type="tel" />
              <FormField label="Email officiel (facultatif)" icon={<Mail size={14} />} placeholder="contact@ecole.cg" value={form.email} onChange={updateForm("email")} type="email" />
              <FormField label="Mot de passe" icon={<Lock size={14} />} placeholder="Votre mot de passe" value={form.password} onChange={updateForm("password")} type="password" />
              <FormField label="Confirmer le mot de passe" icon={<Lock size={14} />} placeholder="Retapez votre mot de passe" value={form.confirmPassword} onChange={updateForm("confirmPassword")} type="password" />
            </div>
          )}

          {mode === "register" && (
            <button type="button" onClick={startGoogleAuth} disabled={loading} className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60">
              <GoogleMark /> {loading ? "Redirection vers Google…" : "S’inscrire avec Google"}
            </button>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
              {error}
            </div>
          )}

          {info && (
            <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              {info}
            </div>
          )}

          <button
            onClick={submitAuth}
            disabled={loading}
            className="primary-button w-full disabled:bg-slate-200 disabled:text-slate-400 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? "Traitement..." : mode === "login" ? "Se connecter" : mode === "forgot" ? otpFor === form.identifier.trim() && otpPurpose === "reset" ? "Réinitialiser le mot de passe" : "Envoyer le code" : "Créer mon compte"}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return <svg aria-hidden="true" viewBox="0 0 48 48" className="h-5 w-5"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.72 7.18l7.62 5.91c4.45-4.11 7.14-10.17 7.14-17.56Z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.54 2.56 10.78l7.97-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.89l-7.62-5.91c-2.12 1.42-4.83 2.27-8.28 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg>;
}
