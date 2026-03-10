
import React from 'react';
import { AnalysisResult, Severity } from '../types';
import { AlertTriangle, AlertCircle, Info, Eye } from 'lucide-react';

interface Props {
  findings: AnalysisResult[];
}

const getSeverityStyles = (severity: string) => {
  switch (severity) {
    case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-200';
    case 'MAJOR': return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'MINOR': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    default: return 'bg-blue-100 text-blue-800 border-blue-200';
  }
};

const getSeverityIcon = (severity: string) => {
  switch (severity) {
    case 'CRITICAL': return <AlertTriangle className="w-3 h-3" />;
    case 'MAJOR': return <AlertCircle className="w-3 h-3" />;
    case 'MINOR': return <Info className="w-3 h-3" />;
    default: return <Eye className="w-3 h-3" />;
  }
};

const getSeverityLabel = (severity: string) => {
  switch (severity) {
    case 'CRITICAL': return 'CRÍTICO';
    case 'MAJOR': return 'MAIOR';
    case 'MINOR': return 'MENOR';
    case 'OBSERVATION': return 'OBSERVAÇÃO';
    default: return severity;
  }
};

export const FindingsTable: React.FC<Props> = ({ findings }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-100 bg-slate-50/50">
            <th className="py-3 px-4 text-[10px] font-black uppercase text-slate-500 tracking-wider">Gravidade</th>
            <th className="py-3 px-4 text-[10px] font-black uppercase text-slate-500 tracking-wider">Norma & Cláusula</th>
            <th className="py-3 px-4 text-[10px] font-black uppercase text-slate-500 tracking-wider">Descrição do Erro</th>
            <th className="py-3 px-4 text-[10px] font-black uppercase text-slate-500 tracking-wider">Ação Recomendada</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {findings.map((f, i) => (
            <tr key={i} className="hover:bg-slate-50/80 transition-colors">
              <td className="py-4 px-4 align-top">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border ${getSeverityStyles(f.severity)}`}>
                  {getSeverityIcon(f.severity)}
                  {getSeverityLabel(f.severity)}
                </span>
              </td>
              <td className="py-4 px-4 align-top">
                <div className="font-bold text-slate-700 text-xs uppercase tracking-tight">{f.standard}</div>
                <div className="text-[10px] text-slate-500 font-medium mt-1">Cláusula {f.clause}</div>
              </td>
              <td className="py-4 px-4 align-top">
                <p className="text-sm text-slate-600 leading-relaxed font-medium">{f.finding}</p>
              </td>
              <td className="py-4 px-4 align-top">
                <div className="text-sm text-indigo-700 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 shadow-sm">
                  <span className="font-black text-[10px] uppercase block mb-1 text-indigo-900 tracking-widest">Recomendação Técnica:</span>
                  {f.recommendation}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
