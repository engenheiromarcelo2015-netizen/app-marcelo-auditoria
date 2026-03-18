
import React from 'react';
import { ShieldCheck, CheckCircle2, Building2 } from 'lucide-react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <header className="bg-slate-900 text-white py-2 px-4 shadow-xl sticky top-0 z-50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center">

          <div className="space-y-0">
            <h1 className="font-black text-xl tracking-tighter text-white drop-shadow-md leading-none">App Marcelo Dias</h1>
            <p className="text-[8px] text-red-500 font-black uppercase tracking-[0.4em] mt-1 leading-none">Soluções Empreendedoras</p>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8">
        {children}
      </main>

      <footer className="bg-white border-t p-6 text-center">
        <div className="max-w-7xl mx-auto">
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center justify-center gap-2">
            <ShieldCheck className="w-3 h-3" />
            Plataforma Exclusiva de Gestão da Qualidade & Auditoria
          </p>
          <p className="text-slate-600 text-sm font-semibold">
            &copy; {new Date().getFullYear()} Soluções Empreendedoras | App Marcelo Dias CNPJ: 23.067.526/0001-94
          </p>
        </div>
      </footer>
    </div>
  );
};
