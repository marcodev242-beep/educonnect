import React, { useEffect, useState } from "react";
import { Clock3 } from "lucide-react";

export function ExamCountdown({ endsAt }: { endsAt: string | Date }) {
  const endTime = new Date(endsAt).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, endTime - Date.now()));

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, endTime - Date.now()));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [endTime]);

  const totalSeconds = Math.floor(remaining / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return (
    <div className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-sm font-black ${remaining > 0 ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`} aria-live="polite">
      <Clock3 size={16} />
      {remaining > 0 ? `Temps restant ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : "Épreuve terminée"}
    </div>
  );
}
