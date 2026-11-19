import React, { useEffect, useState } from "react";
import { ArrowLeft, Building2, Mail, Phone, BookOpen } from "lucide-react";
import { AuthUser } from "../types";

interface StudentProfileData {
  profile: {
    id: string;
    fullName: string;
    email: string;
    school: {
      id: string;
      name: string;
      city: string;
      phone: string;
    };
    purchases: number;
  } | null;
}

export function StudentProfilePage({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const [profile, setProfile] = useState<StudentProfileData>({ profile: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/student/profile?studentId=${encodeURIComponent(studentId)}`)
      .then(res => res.json())
      .then(data => setProfile(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return <div className="app-shell min-h-screen flex items-center justify-center text-slate-500">Chargement du profil…</div>;
  }

  if (!profile.profile) {
    return <div className="app-shell min-h-screen flex items-center justify-center text-slate-500">Profil introuvable.</div>;
  }

  return (
    <div className="app-shell min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <button type="button" onClick={onBack} className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-600">
          <ArrowLeft size={14} /> Retour
        </button>

        <div className="bg-white/90 rounded-[28px] border border-white/70 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center text-green-600 text-3xl font-black">
              {profile.profile.fullName.split(' ').map(part => part[0]).slice(0, 2).join('')}
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900">{profile.profile.fullName}</h1>
              <p className="text-sm text-slate-500">{profile.profile.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Ecole associée</p>
              <p className="text-sm font-semibold text-slate-800">{profile.profile.school.name}</p>
              <p className="text-xs text-slate-500">{profile.profile.school.city}</p>
              <p className="text-xs text-slate-500 mt-2">{profile.profile.school.phone}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Achats</p>
              <p className="text-3xl font-black text-slate-900">{profile.profile.purchases}</p>
              <p className="text-xs text-slate-500">documents achetés</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-400 uppercase tracking-[0.2em] mb-2">Coordonnées</p>
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-center gap-2"><Mail size={14} /> {profile.profile.email}</div>
              <div className="flex items-center gap-2"><Phone size={14} /> {profile.profile.school.phone || 'Téléphone non renseigné'}</div>
              <div className="flex items-center gap-2"><Building2 size={14} /> {profile.profile.school.name}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
