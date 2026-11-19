import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, GraduationCap, Mail, Phone, MapPin, FileText, BookOpen } from "lucide-react";

interface TeacherProfileData {
  profile: {
    id: string;
    name: string;
    email: string;
    cycle: string;
    subject: string;
    photoUrl: string;
    bio: string;
    phone: string;
    status: string;
  } | null;
  schools: Array<{ id: string; name: string; city: string; email: string; status: string }>;
  papersByCategory: Array<{ category: string; papers: any[] }>;
}

export function TeacherProfilePage({ teacherId, onBack }: { teacherId: string; onBack: () => void }) {
  const [teacherProfile, setTeacherProfile] = useState<TeacherProfileData>({ profile: null, schools: [], papersByCategory: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: "", bio: "", cycle: "", subject: "", phone: "", schoolId: "" });
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch(`/api/teacher/profile?teacherId=${encodeURIComponent(teacherId)}`)
      .then(res => res.json())
      .then((data) => {
        setTeacherProfile(data);
        setForm({
          fullName: data.profile?.name || "",
          bio: data.profile?.bio || "",
          cycle: data.profile?.cycle || "",
          subject: data.profile?.subject || "",
          phone: data.profile?.phone || "",
          schoolId: "",
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [teacherId]);

  const schools = useMemo(() => teacherProfile.schools || [], [teacherProfile]);

  const saveProfile = async () => {
    setSaving(true);
    try {
      const payload = new FormData();
      payload.append('teacherId', teacherId);
      payload.append('fullName', form.fullName);
      payload.append('bio', form.bio);
      payload.append('cycle', form.cycle);
      payload.append('subject', form.subject);
      payload.append('phone', form.phone);
      if (form.schoolId) payload.append('schoolId', form.schoolId);
      if (selectedPhoto) payload.append('photo', selectedPhoto);

      const res = await fetch('/api/teacher/profile', { method: 'POST', body: payload });
      if (!res.ok) {
        throw new Error('Impossible de sauvegarder le profil');
      }

      const result = await fetch(`/api/teacher/profile?teacherId=${encodeURIComponent(teacherId)}`);
      const data = await result.json();
      setTeacherProfile(data);
      setSelectedPhoto(null);
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="app-shell min-h-screen flex items-center justify-center text-slate-500">Chargement du profil…</div>;
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <button type="button" onClick={onBack} className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-600">
          <ArrowLeft size={14} /> Retour au catalogue
        </button>

        <div className="grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-6">
          <section className="space-y-4">
            <div className="bg-white/90 rounded-[28px] border border-white/70 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="relative group">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-md">
                    {teacherProfile.profile?.photoUrl ? (
                      <img src={teacherProfile.profile.photoUrl} alt={teacherProfile.profile.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-green-500 to-emerald-600 text-white text-lg font-black">
                        {teacherProfile.profile?.name?.split(' ').map(part => part[0]).slice(0,2).join('') || 'EN'}
                      </div>
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-green-600 p-2 text-white shadow-md">
                    <Camera size={12} />
                  </span>
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={e => setSelectedPhoto(e.target.files?.[0] || null)} />
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400 font-bold">Profil enseignant</p>
                  <h1 className="text-2xl font-black text-slate-900">{teacherProfile.profile?.name || 'Enseignant'}</h1>
                  <p className="text-sm text-slate-500">{teacherProfile.profile?.subject || 'Matière non renseignée'}</p>
                </div>
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2"><Mail size={14} /> {teacherProfile.profile?.email}</div>
                <div className="flex items-center gap-2"><Phone size={14} /> {teacherProfile.profile?.phone || 'Téléphone non renseigné'}</div>
                <div className="flex items-center gap-2"><GraduationCap size={14} /> {teacherProfile.profile?.cycle || 'Cycle non renseigné'}</div>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">
                <p className="font-bold text-slate-800 mb-1">Biographie</p>
                <p>{teacherProfile.profile?.bio || 'Aucune biographie ajoutée pour le moment.'}</p>
              </div>
            </div>

            <div className="bg-white/90 rounded-[28px] border border-white/70 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <h2 className="text-sm font-black uppercase tracking-[0.24em] text-slate-400 mb-3">Écoles associées</h2>
              <div className="space-y-2">
                {schools.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune école associée pour le moment.</p>
                ) : schools.map(school => (
                  <div key={school.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-800">{school.name}</p>
                        <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={11} /> {school.city}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${school.status === 'VALIDE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {school.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="bg-white/90 rounded-[28px] border border-white/70 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <h2 className="text-sm font-black uppercase tracking-[0.24em] text-slate-400 mb-4">Modifier le profil</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm font-semibold text-slate-600">
                  Nom complet
                  <input value={form.fullName} onChange={e => setForm(prev => ({ ...prev, fullName: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="text-sm font-semibold text-slate-600">
                  Téléphone
                  <input value={form.phone} onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="text-sm font-semibold text-slate-600">
                  Cycle
                  <select value={form.cycle} onChange={e => setForm(prev => ({ ...prev, cycle: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">
                    <option value="">Choisir</option>
                    <option value="Collège">Collège</option>
                    <option value="Lycée">Lycée</option>
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-600">
                  Matière principale
                  <input value={form.subject} onChange={e => setForm(prev => ({ ...prev, subject: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="text-sm font-semibold text-slate-600 md:col-span-2">
                  Biographie
                  <textarea value={form.bio} onChange={e => setForm(prev => ({ ...prev, bio: e.target.value }))} rows={4} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" />
                </label>
                <label className="text-sm font-semibold text-slate-600 md:col-span-2">
                  Ajouter une école à son profil
                  <select value={form.schoolId} onChange={e => setForm(prev => ({ ...prev, schoolId: e.target.value }))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">
                    <option value="">Sélectionner une école</option>
                    {teacherProfile.schools.map(school => (
                      <option key={school.id} value={school.id}>{school.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="button" onClick={saveProfile} className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2.5 rounded-xl">
                {saving ? 'Sauvegarde…' : 'Enregistrer le profil'}
              </button>
            </div>

            <div className="bg-white/90 rounded-[28px] border border-white/70 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
              <h2 className="text-sm font-black uppercase tracking-[0.24em] text-slate-400 mb-4">Sujets publiés par l’enseignant</h2>
              <div className="space-y-4">
                {teacherProfile.papersByCategory.length === 0 ? (
                  <p className="text-sm text-slate-500">Aucun sujet publié pour le moment.</p>
                ) : teacherProfile.papersByCategory.map(group => (
                  <div key={group.category} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen size={14} className="text-green-600" />
                      <p className="font-black text-slate-800">{group.category}</p>
                    </div>
                    <div className="space-y-2">
                      {group.papers.map((paper: any) => (
                        <div key={paper.id} className="rounded-xl bg-white border border-slate-100 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-bold text-slate-800">{paper.title}</p>
                              <p className="text-xs text-slate-500">{paper.level} • {paper.subject}</p>
                            </div>
                            <span className="text-sm font-black text-green-600">{paper.price.toLocaleString('fr-FR')} FCFA</span>
                          </div>
                          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                            <FileText size={12} /> {paper.date}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
