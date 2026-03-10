
import React from 'react';
import { ShieldCheck, CheckCircle2, Building2 } from 'lucide-react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <header className="bg-slate-900 text-white py-2 px-4 shadow-xl sticky top-0 z-50 border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
          {/* Foto Animada (Efeito GIF/Digital Scan) */}
          <div className="mb-2 relative group">
            {/* Brilho de Fundo Pulsante */}
            <div className="absolute -inset-2 bg-red-600/20 rounded-full blur-xl animate-pulse"></div>
            
            <div className="relative w-16 h-16">
              {/* Moldura Giratória */}
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-red-500/50 animate-[spin_8s_linear_infinite]"></div>
              
              {/* Container da Foto */}
              <div className="absolute inset-1 rounded-full overflow-hidden border-2 border-red-600 bg-slate-800 shadow-2xl">
                {/* Foto do Marcelo Dias */}
                <img 
                  src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=200&h=200" 
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://ui-avatars.com/api/?name=Marcelo+Dias&background=DC2626&color=fff';
                  }}
                  alt="Marcelo Dias"
                  className="w-full h-full object-cover grayscale-[0.1] group-hover:grayscale-0 transition-all duration-500 scale-125 animate-subtle-zoom"
                  referrerPolicy="no-referrer"
                />
                
                {/* Linha de Scan (Efeito Digital) */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-500/30 to-transparent h-1/4 w-full animate-scan pointer-events-none"></div>
                
                {/* Overlay de Textura Digital Grid */}
                <div className="absolute inset-0 opacity-20 bg-[linear-gradient(rgba(220,38,38,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(220,38,38,0.1)_1px,transparent_1px)] bg-[size:4px_4px]"></div>
              </div>

              {/* Badge de Verificado */}
              <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-green-500 rounded-full border-2 border-slate-900 flex items-center justify-center shadow-lg animate-bounce">
                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
          </div>
          
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
