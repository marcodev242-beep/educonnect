import React from "react";

export function FilterBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors font-medium ${active ? "bg-green-50 text-green-700 font-bold" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"}`}
    >
      {label}
    </button>
  );
}
