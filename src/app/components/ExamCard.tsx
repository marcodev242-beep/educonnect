import React from "react";
import { BookOpen, GraduationCap, User, Clock, MapPin, Star } from "lucide-react";
import { Exam } from "../types";

interface ExamCardProps {
  exam: Exam;
  onSelect: (exam: Exam) => void;
  isTeacher?: boolean;
}

export function ExamCard({ exam, onSelect, isTeacher = false }: ExamCardProps) {
  const price = Number(exam.prix_inscription || 0);
  const isFree = price <= 0;
  const formattedStart = new Date(exam.date_debut).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const statutLabels: Record<string, string> = {
    ANNOUNCE: "Annonce",
    EN_COURS: "En cours",
    TERMINE: "Termine",
    ANNULE: "Annule",
  };
  const statutColors: Record<string, string> = {
    ANNOUNCE: "bg-amber-50 text-amber-700 border-amber-100",
    EN_COURS: "bg-emerald-50 text-emerald-700 border-emerald-100",
    TERMINE: "bg-slate-50 text-slate-700 border-slate-100",
    ANNULE: "bg-red-50 text-red-700 border-red-100",
  };

  return (
    <article
      onClick={() => onSelect(exam)}
      className="rounded-2xl border border-white/70 bg-white/85 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-xl hover:border-green-300 hover:shadow-[0_24px_60px_rgba(15,23,42,0.10)] transition-all cursor-pointer"
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-slate-500" />
            <span className="text-xs font-black text-slate-600 uppercase tracking-[0.18em]">
              {exam.nom_matiere || "Matière"}
            </span>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-[0.12em] ${statutColors[exam.statut] || "bg-slate-50 text-slate-600 border-slate-100"}`}
          >
            {statutLabels[exam.statut] || exam.statut}
          </span>
        </div>

        <h3 className="text-sm font-black text-slate-900 leading-snug line-clamp-1">{exam.titre}</h3>

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500">
            <GraduationCap className="h-4 w-4" />
            <span>{exam.nom_classe || "—"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <Clock className="h-4 w-4" />
            <span>{exam.duree_minutes} min</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <MapPin className="h-4 w-4" />
            <span>{formattedStart}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-400" />
            <span className="text-xs text-slate-500">{exam.nom_enseignant || "Enseignant"}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {exam.note_enseignant != null ? (
              <>
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span className="text-xs font-black text-slate-700">{exam.note_enseignant}</span>
                {exam.nombre_avis != null && (
                  <span className="text-[10px] text-slate-400">({exam.nombre_avis})</span>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-400">Pas d'avis</span>
            )}
          </div>

          <span className={`text-xs font-black px-2 py-1 rounded-full ${
            isFree ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-green-50 text-green-700 border-green-100"
          }`}>
            {isFree ? "Gratuit" : `${price.toLocaleString("fr-FR")} FCFA`}
          </span>
        </div>
      </div>
    </article>
  );
}