
import React, { useState } from 'react';
import { Layout } from './components/Layout';
import { FindingsTable } from './components/FindingsTable';
import { DocumentSummary } from './types';
import { analyzeDocuments, AnalysisMode } from './services/geminiService';
import { saveAnalysis } from './services/analysisService';
import { 
  validateLogin, 
  registerSession, 
  updateHeartbeat, 
  clearSession, 
  registerUser,
  checkAccessStatus,
  UserData
} from './services/authService';
import { 
  generatePixPayment, 
  simulatePaymentSuccess, 
  getLatestPendingPayment,
  PaymentData
} from './services/paymentService';
import { 
  FileUp, 
  Trash2, 
  Play, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  Download, 
  Lightbulb,
  MonitorCheck,
  Lock,
  LogIn,
  LogOut,
  UserPlus,
  ArrowLeft,
  QrCode,
  CreditCard,
  ExternalLink
} from 'lucide-react';

// Senhas gerenciadas no Supabase (tabela access_passwords)

const App: React.FC = () => {
  // ── Auth ──
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register' | 'payment'>('login');
  const [currentUser, setCurrentUser] = useState<UserData | null>(null);
  
  // States para Forms
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regEmail, setRegEmail] = useState('');
  
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  
  // ── Payment ──
  const [activePayment, setActivePayment] = useState<PaymentData | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);

  // ── App ──
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisModes, setAnalysisModes] = useState<AnalysisMode[]>(['IATF']);
  const [savedToDb, setSavedToDb] = useState<boolean | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(localStorage.getItem('session_token'));

  // ── Session Heartbeat & Recovery ──
  React.useEffect(() => {
    const recoveredToken = localStorage.getItem('session_token');
    const recoveredUserId = localStorage.getItem('user_id');

    if (recoveredToken && recoveredUserId) {
      // Tenta validar a sessão existente no banco
      updateHeartbeat(recoveredToken).then(async valid => {
        if (valid) {
          const { isPaid: paid } = await checkAccessStatus(recoveredUserId);
          setIsPaid(paid);
          setIsAuthenticated(true);
          setSessionToken(recoveredToken);
          if (!paid) setAuthView('payment');
        } else {
          handleLogout();
        }
      });
    }

    // Heartbeat interval (1 minuto)
    const interval = setInterval(() => {
      const currentToken = localStorage.getItem('session_token');
      const currentUserId = localStorage.getItem('user_id');
      if (isAuthenticated && currentToken && currentUserId) {
        updateHeartbeat(currentToken).then(async valid => {
          if (!valid) {
            handleLogout();
            setLoginError('Sua sessão expirou ou foi encerrada em outro dispositivo.');
          } else {
            // Verifica se o pagamento ainda é válido
            const { isPaid: paid } = await checkAccessStatus(currentUserId);
            setIsPaid(paid);
          }
        });
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleLogout = async () => {
    const currentToken = sessionToken || localStorage.getItem('session_token');
    if (currentToken) {
      await clearSession(currentToken);
    }
    setIsAuthenticated(false);
    setIsPaid(false);
    setSessionToken(null);
    setCurrentUser(null);
    setAuthView('login');
    setFiles([]);
    setSummary(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) return;
    setLoginLoading(true);
    setLoginError(null);
    const userData = await validateLogin(loginUsername.trim(), loginPassword.trim());
    
    if (userData) {
      const token = await registerSession(userData.id, navigator.userAgent);
      if (token) {
        setSessionToken(token);
        setCurrentUser(userData);
        
        // Verifica pagamento
        const { isPaid: paid } = await checkAccessStatus(userData.id);
        setIsPaid(paid);
        setIsAuthenticated(true);
        
        if (!paid) {
          setAuthView('payment');
          // Busca ou gera pagamento pendente
          const existing = await getLatestPendingPayment(userData.id);
          if (existing) {
            setActivePayment(existing);
          } else {
            const newPayment = await generatePixPayment(userData.id);
            setActivePayment(newPayment);
          }
        }
      } else {
        setLoginError('Usuário já logado em outro dispositivo. Aguarde 5 minutos ou deslogue da outra sessão.');
      }
    } else {
      setLoginError('Senha inválida. Verifique e tente novamente.');
    }
    setLoginLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regPassword.trim() || !regEmail.trim()) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const userData = await registerUser(regUsername.trim(), regPassword.trim(), regEmail.trim());
      if (userData) {
        // Após registro, faz login automático
        setLoginUsername(regUsername);
        setLoginPassword(regPassword);
        setAuthView('login');
        setLoginError('Cadastro realizado! Clique em Entrar.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Erro ao realizar cadastro.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!activePayment || !currentUser) return;
    setPaymentLoading(true);
    const success = await simulatePaymentSuccess(activePayment.id, currentUser.id);
    if (success) {
      setIsPaid(true);
      setActivePayment(null);
    } else {
      setLoginError('Erro ao processar pagamento simulado.');
    }
    setPaymentLoading(false);
  };

  if (!isAuthenticated || !isPaid) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-2xl shadow-2xl mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">App Marcelo Dias</h1>
            <p className="text-red-500 text-xs font-black uppercase tracking-[0.3em] mt-1">Soluções Empreendedoras</p>
          </div>

          {authView === 'login' && (
            <>
              <form onSubmit={handleLogin} className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700 space-y-5">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Login</label>
                  <input
                    type="text"
                    value={loginUsername}
                    onChange={e => setLoginUsername(e.target.value)}
                    placeholder="Digite seu login"
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm font-medium transition-all"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Senha de Acesso</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm font-medium transition-all"
                  />
                </div>

                {loginError && (
                  <div className={`flex items-center gap-2 border rounded-xl p-3 ${loginError.includes('Cadastro') ? 'bg-emerald-900/30 border-emerald-800' : 'bg-red-900/30 border-red-800'}`}>
                    <AlertCircle className={`w-4 h-4 shrink-0 ${loginError.includes('Cadastro') ? 'text-emerald-400' : 'text-red-400'}`} />
                    <p className={`text-xs font-bold ${loginError.includes('Cadastro') ? 'text-emerald-400' : 'text-red-400'}`}>{loginError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loginLoading || !loginUsername.trim() || !loginPassword.trim()}
                  className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 px-4 rounded-xl shadow-lg transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                >
                  {loginLoading ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  {loginLoading ? 'Verificando...' : 'Entrar'}
                </button>
              </form>
              <button 
                onClick={() => setAuthView('register')}
                className="w-full mt-4 flex items-center justify-center gap-2 text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                <UserPlus className="w-3 h-3" />
                Criar Nova Conta
              </button>
            </>
          )}

          {authView === 'register' && (
            <form onSubmit={handleRegister} className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700 space-y-5 animate-fade-in">
              <button 
                type="button"
                onClick={() => setAuthView('login')}
                className="flex items-center gap-1 text-slate-400 hover:text-white text-[10px] font-black uppercase mb-2"
              >
                <ArrowLeft className="w-3 h-3" /> Voltar
              </button>
              
              <h2 className="text-white font-black uppercase tracking-widest text-sm mb-4">Cadastro de Usuário</h2>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">E-mail</label>
                <input
                  type="email"
                  value={regEmail}
                  onChange={e => setRegEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Login Escolhido</label>
                <input
                  type="text"
                  value={regUsername}
                  onChange={e => setRegUsername(e.target.value)}
                  placeholder="Ex: marcelo123"
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm font-medium transition-all"
                />
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Senha</label>
                <input
                  type="password"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                  placeholder="Crie uma senha"
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm font-medium transition-all"
                />
              </div>

              {loginError && (
                <div className="flex items-center gap-2 bg-red-900/30 border border-red-800 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-red-400 text-xs font-bold">{loginError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading || !regUsername.trim() || !regPassword.trim() || !regEmail.trim()}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3 px-4 rounded-xl shadow-lg transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
              >
                {loginLoading ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4" />
                )}
                {loginLoading ? 'Processando...' : 'Finalizar Cadastro'}
              </button>
            </form>
          )}

          {authView === 'payment' && (
            <div className="bg-slate-800 rounded-2xl p-8 shadow-2xl border border-slate-700 space-y-6 animate-fade-in text-center">
              <div className="space-y-2">
                <h2 className="text-white font-black uppercase tracking-widest text-lg">Acesso Bloqueado</h2>
                <p className="text-slate-400 text-xs font-medium">Sua conta está ativa, mas você precisa de um plano para liberar os recursos de auditoria.</p>
              </div>

              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Plano Mensal</span>
                  <span className="text-white font-black text-sm">R$ 29,90</span>
                </div>
                
                <div className="bg-white p-4 rounded-xl inline-block mx-auto">
                  {/* Simulação de QR Code */}
                  <QrCode className="w-32 h-32 text-slate-900" />
                </div>

                <div className="space-y-3">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">PIX Copia e Cola:</div>
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-[10px] text-slate-300 font-mono break-all line-clamp-2">
                    {activePayment?.pix_qr_code || 'Gerando código...'}
                  </div>
                  <button 
                    onClick={() => navigator.clipboard.writeText(activePayment?.pix_qr_code || '')}
                    className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white text-[10px] font-black uppercase tracking-widest py-2"
                  >
                    <ExternalLink className="w-3 h-3" /> Copiar Código PIX
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleSimulatePayment}
                  disabled={paymentLoading || !activePayment}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black py-4 px-4 rounded-xl shadow-lg transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                >
                  {paymentLoading ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CreditCard className="w-4 h-4" />
                  )}
                  {paymentLoading ? 'Confirmando...' : 'Confirmar Pagamento'}
                </button>
                
                <button 
                  onClick={handleLogout}
                  className="w-full text-slate-500 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest"
                >
                  Sair do Sistema
                </button>
              </div>

              <div className="flex items-center justify-center gap-2 opacity-50">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span className="text-[9px] text-slate-400 uppercase font-black tracking-widest">Liberação Imediata via PIX</span>
              </div>
            </div>
          )}

          <p className="text-center text-slate-600 text-[10px] mt-6 uppercase tracking-widest">
            CNPJ: 23.067.526/0001-94
          </p>
        </div>
      </div>
    );
  }

  const toggleAnalysisMode = (mode: AnalysisMode) => {
    setAnalysisModes(prev => {
      if (prev.includes(mode)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(m => m !== mode);
      }
      return [...prev, mode];
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = event.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    setError(null);
    const fileList = Array.from(uploadedFiles) as File[];
    
    try {
      const filePromises = fileList.map(file => {
        return new Promise<{ name: string; text: string }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              name: file.name,
              text: e.target?.result as string || ''
            });
          };
          reader.onerror = reject;
          reader.readAsText(file);
        });
      });

      const loadedFiles = await Promise.all(filePromises);
      // Adiciona novos arquivos à lista existente sem disparar análise
      setFiles(prev => [...prev, ...loadedFiles]);
      // Limpa o resumo antigo se estiver adicionando novos arquivos
      setSummary(null);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar arquivos. Verifique se são formatos de texto válidos.");
    }
    // Limpa o input para permitir selecionar os mesmos arquivos se necessário
    event.target.value = '';
  };

  const startAnalysis = async () => {
    if (files.length === 0) {
      setError("Por favor, anexe ao menos um arquivo antes de iniciar.");
      return;
    }

    setLoading(true);
    setError(null);
    setSavedToDb(null);
    try {
      const analysis = await analyzeDocuments(files, analysisModes);
      setSummary(analysis);
      // Persiste automaticamente no Supabase
      const fileNames = files.map(f => f.name);
      const savedId = await saveAnalysis(analysis, analysisModes, fileNames);
      setSavedToDb(savedId !== null);
    } catch (err: any) {
      console.error('Erro detalhado da IA:', err);
      // Extrai a mensagem real do erro
      const errorMsg = err?.message || String(err);
      setError(`Falha na IA: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setSummary(null);
  };

  const reset = () => {
    setFiles([]);
    setSummary(null);
    setError(null);
    setSavedToDb(null);
  };

  const handleExportData = () => {
    if (!summary) return;

    try {
      const jspdfLib = (window as any).jspdf;
      if (!jspdfLib || !jspdfLib.jsPDF) {
        alert("A biblioteca de PDF ainda está carregando. Por favor, aguarde um momento e tente novamente.");
        return;
      }

      const doc = new jspdfLib.jsPDF();
      const dateStr = new Date().toLocaleDateString('pt-BR');
      const timeStr = new Date().toLocaleTimeString('pt-BR');

      // Configuração do Cabeçalho Estilizado
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 210, 45, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('MARCELO DIAS', 105, 18, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(239, 68, 68); // red-500
      doc.text('SOLUÇÕES EMPREENDEDORAS', 105, 25, { align: 'center' });
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.text(`RELATÓRIO TÉCNICO DE AUDITORIA: ${analysisModes.join(' + ').toUpperCase()}`, 105, 34, { align: 'center' });
      doc.setFontSize(8);
      doc.text(`GERADO EM: ${dateStr} às ${timeStr}`, 105, 40, { align: 'center' });

      // Seção de Panorama
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('PANORAMA DE CONFORMIDADE', 14, 60);
      
      // Linha decorativa
      doc.setDrawColor(226, 232, 240);
      doc.line(14, 63, 196, 63);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Pontuação Geral Estimada: ${summary.overallScore}%`, 14, 72);
      doc.text(`Status IATF 16949: ${summary.complianceProgress.iatf}%`, 14, 78);
      doc.text(`Status ISO 14001: ${summary.complianceProgress.iso14001}%`, 14, 84);

      // Resumo de Desvios
      doc.setFont('helvetica', 'bold');
      doc.text('RESUMO DE DESVIOS:', 120, 72);
      doc.setFont('helvetica', 'normal');
      doc.text(`• Críticos: ${summary.criticalIssues}`, 120, 78);
      doc.text(`• Maiores: ${summary.majorIssues}`, 120, 84);
      doc.text(`• Menores: ${summary.minorIssues}`, 120, 90);

      // Tabela de Achados
      (doc as any).autoTable({
        startY: 100,
        head: [['Gravidade', 'Norma / Cláusula', 'Descrição do Achado', 'Recomendação Técnica']],
        body: summary.findings.map(f => [
          f.severity,
          `${f.standard}\n${f.clause}`,
          f.finding,
          f.recommendation
        ]),
        headStyles: { 
          fillColor: [15, 23, 42],
          fontSize: 9,
          halign: 'center'
        },
        styles: { 
          fontSize: 8, 
          cellPadding: 5,
          overflow: 'linebreak',
          cellWidth: 'wrap'
        },
        columnStyles: {
          0: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 35 },
          2: { cellWidth: 65 },
          3: { cellWidth: 65 },
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 100 }
      });

      // Isenção de Responsabilidade (Aviso Legal)
      const finalY = (doc as any).lastAutoTable.finalY + 15;
      if (finalY < 240) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.setFont('helvetica', 'bold');
        doc.text('AVISO LEGAL:', 14, finalY);
        doc.setFont('helvetica', 'normal');
        const disclaimer = [
          "A Soluções Empreendedoras desenvolveu o App Marcelo Dias para apoiar equipes de gestão. A empresa se exime de",
          "qualquer responsabilidade quanto à utilização das informações disponibilizadas. A correta aplicação e interpretação",
          "dos dados são de responsabilidade exclusiva do usuário. Recomenda-se consulta a especialistas qualificados."
        ];
        doc.text(disclaimer, 14, finalY + 5);
      }

      // Rodapé em todas as páginas
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount} | App Marcelo Dias | CNPJ: 23.067.526/0001-94`, 105, 285, { align: 'center' });
        doc.text('Relatório gerado por Inteligência Artificial - Uso Consultivo.', 105, 290, { align: 'center' });
      }

        const fileName = `Relatorio_Auditoria_${analysisModes.join('_')}_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);
      
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      alert("Erro técnico ao gerar o PDF. Verifique os dados e tente novamente.");
    }
  };

  return (
    <Layout>
      <div className="flex justify-end mb-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700 shadow-lg"
        >
          <LogOut className="w-3 h-3 text-red-500" />
          Sair do Sistema
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna Esquerda: Gerenciamento de Arquivos */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <h2 className="font-black text-slate-700 flex items-center gap-2 text-[10px] uppercase tracking-widest leading-tight">
                <FileUp className="w-4 h-4 text-red-600 shrink-0" />
                Configuração da Análise
              </h2>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Seletor de Modo de Análise */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Escopo da Varredura</label>
                <div className="grid grid-cols-1 gap-1 bg-slate-100 p-1 rounded-xl">
                  {(['IATF', 'ISO 14001', 'ISO 9001 + E1'] as AnalysisMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => toggleAnalysisMode(mode)}
                      className={`py-2 px-1 text-[9px] font-black uppercase rounded-lg transition-all ${
                        analysisModes.includes(mode)
                          ? 'bg-red-600 text-white shadow-md' 
                          : 'text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-6 hover:border-red-400 hover:bg-red-50/50 transition-all text-center group">
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="space-y-2">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto group-hover:bg-red-100 transition-colors">
                    <FileText className="w-6 h-6 text-slate-400 group-hover:text-red-600" />
                  </div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    Coloque aqui seus documentos para análise do App Marcelo Dias:
                  </p>
                </div>
              </div>

              {files.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pendentes ({files.length})</span>
                    <button onClick={reset} className="text-[10px] text-red-500 hover:underline font-bold uppercase tracking-widest">Remover Todos</button>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {files.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-red-200 transition-colors">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText className="w-4 h-4 text-red-600 shrink-0" />
                          <span className="text-xs font-semibold text-slate-700 truncate">{file.name}</span>
                        </div>
                        <button onClick={() => removeFile(idx)} className="text-slate-300 hover:text-red-500 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {!loading && (
                    <button 
                      onClick={startAnalysis}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 px-4 rounded-xl shadow-lg shadow-red-100 transition-all transform active:scale-[0.98] uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Iniciar Verificação Técnica
                    </button>
                  )}
                </div>
              )}

              {loading && (
                <div className="p-6 bg-slate-900 rounded-2xl space-y-4 border border-red-500/30">
                  <div className="flex items-center justify-center">
                    <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-black text-white uppercase tracking-[0.2em]">IA em Processamento</p>
                    <p className="text-[9px] text-slate-400 mt-2 uppercase">Analisando diretrizes da Soluções Empreendedoras...</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {summary && !loading && (
            <div className="bg-gradient-to-br from-red-700 to-slate-900 rounded-2xl shadow-xl p-6 text-white space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-xs uppercase tracking-widest opacity-80">Panorama Geral</h3>
                <button 
                  onClick={handleExportData}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors border border-white/10"
                  title="Exportar PDF"
                >
                  <Download className="w-4 h-4 text-white" />
                </button>
              </div>
              
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-[10px] font-black mb-1 uppercase tracking-widest opacity-70">
                    <span>Audit Score</span>
                    <span>{summary.overallScore}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-1 overflow-hidden">
                    <div className="bg-white h-full shadow-[0_0_8px_rgba(255,255,255,0.5)]" style={{ width: `${summary.overallScore}%` }}></div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                    <div className="text-[10px] font-bold text-red-200 uppercase mb-1 opacity-60">IATF</div>
                    <div className="text-xl font-black">{summary.complianceProgress.iatf}%</div>
                  </div>
                  <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                    <div className="text-[10px] font-bold text-green-300 uppercase mb-1 opacity-60">ISO 14001</div>
                    <div className="text-xl font-black">{summary.complianceProgress.iso14001}%</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Coluna Direita: Painel de Resultados */}
        <div className="lg:col-span-8 space-y-6">
          {error && (
            <div className="bg-red-50 border-2 border-red-100 text-red-700 p-4 rounded-2xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <p className="text-xs font-black uppercase tracking-wider">{error}</p>
            </div>
          )}

          {savedToDb === true && (
            <div className="bg-emerald-50 border-2 border-emerald-100 text-emerald-700 p-4 rounded-2xl flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <p className="text-xs font-black uppercase tracking-wider">Análise salva com sucesso no banco de dados ✓</p>
            </div>
          )}
          {savedToDb === false && (
            <div className="bg-amber-50 border-2 border-amber-100 text-amber-700 p-4 rounded-2xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-xs font-black uppercase tracking-wider">Análise concluída, mas não foi possível salvar no banco de dados.</p>
            </div>
          )}

          {!summary && !loading && (
            <div className="bg-white rounded-2xl border border-slate-200 p-16 text-center space-y-8 flex flex-col items-center justify-center min-h-[500px]">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200 border border-slate-100">
                <MonitorCheck className="w-10 h-10" />
              </div>
              <div className="max-w-sm">
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Simples Fácil e Rápido.</h3>
                <p className="text-slate-500 mt-4 text-sm leading-relaxed font-medium">
                  Bem-vindo ao <span className="text-red-600 font-bold">App Marcelo Dias</span>. Selecione o escopo da análise, faça o upload dos seus documentos e deixe nossa IA validar sua conformidade técnica em tempo real.
                </p>
              </div>
            </div>
          )}

          {summary && !loading && (
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-fade-in">
              <div className="p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-6 bg-red-600 rounded-full"></div>
                  <h2 className="font-black text-slate-800 text-sm uppercase tracking-widest">
                    Resultados da Varredura ({analysisModes.join(' + ')})
                  </h2>
                </div>
                <button 
                  onClick={handleExportData}
                  className="text-[10px] bg-slate-900 hover:bg-black text-white px-4 py-2 rounded-lg font-black transition-all uppercase tracking-widest flex items-center gap-2"
                >
                  <Download className="w-3 h-3" />
                  Exportar PDF
                </button>
              </div>
              <div className="p-0">
                <FindingsTable findings={summary.findings} />
              </div>
              <div className="p-8 bg-red-50 border-t border-red-100">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-red-600 flex items-center justify-center text-white shrink-0 shadow-lg">
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-red-900 uppercase tracking-widest text-[10px] mb-1">Nota Estratégica</h4>
                    <p className="text-slate-700 leading-relaxed text-sm font-medium whitespace-pre-line">
                      A Soluções Empreendedoras desenvolveu o App Marcelo Dias com o objetivo de contribuir e apoiar a equipe do Sistema de Gestão da Qualidade, APQP e demais atividades correlatas.
                      {"\n\n"}
                      A empresa se exime de qualquer responsabilidade quanto à utilização das informações disponibilizadas no aplicativo, sendo de responsabilidade exclusiva do usuário a correta aplicação, análise e interpretação dos dados contidos no App Marcelo Dias.
                      {"\n\n"}
                      Em caso de dúvidas, recomenda-se a consulta a especialistas ou profissionais qualificados da área.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {loading && (
            <div className="space-y-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white p-8 rounded-2xl border border-slate-100 animate-pulse space-y-6 shadow-sm">
                  <div className="h-4 w-32 bg-slate-100 rounded"></div>
                  <div className="space-y-3">
                    <div className="h-3 w-full bg-slate-50 rounded"></div>
                    <div className="h-3 w-4/5 bg-slate-50 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default App;
