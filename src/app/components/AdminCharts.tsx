import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export default function AdminCharts({ topTeachers, topPapers }: { topTeachers: Array<any>; topPapers: Array<any> }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <h3 className="text-sm font-bold mb-3">Top enseignants — Gains récents</h3>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={topTeachers.map(t => ({ name: t.name, earnings: t.earnings }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip formatter={(value: any) => new Intl.NumberFormat('fr-FR').format(Number(value))} />
              <Legend />
              <Bar dataKey="earnings" name="Gains (CFA)" fill="#16A34A" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 p-4">
        <h3 className="text-sm font-bold mb-3">Top sujets — Téléchargements</h3>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={topPapers.map(p => ({ name: p.title.length > 24 ? p.title.slice(0, 21) + '...' : p.title, downloads: p.downloads }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="downloads" name="Téléchargements" fill="#0F766E" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
