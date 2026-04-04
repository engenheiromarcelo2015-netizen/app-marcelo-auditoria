
import React, { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
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
  consumeCredit,
  UserData
} from './services/authService';
import { 
  generatePixPayment, 
  getLatestPendingPayment,
  CREDIT_PACKAGES,
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
  MonitorCheck,
  Lock,
  LogIn,
  LogOut,
  UserPlus,
  ArrowLeft,
  QrCode,
  CreditCard,
  ExternalLink,
  Coins,
  ShoppingCart,
  Zap,
  Lightbulb
} from 'lucide-react';

// Configura worker do pdfjs-dist v5 via node_modules
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/**
 * Extrai texto de um arquivo PDF usando pdfjs-dist.
 * Se o PDF for baseado em imagem (pouco texto), usa OCR via Tesseract.js.
 */
async function extractPdfText(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

    let fullText = '';
    const maxPages = Math.min(pdf.numPages, 20);
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item: any) => 'str' in item)
        .map((item: any) => item.str)
        .join(' ');
      fullText += pageText + '\n';
    }

    console.log(`PDF "${file.name}": extraídos ${fullText.trim().length} caracteres via pdfjs`);

    // Se pdfjs não conseguiu extrair texto suficiente (PDF de imagem), usa OCR
    if (fullText.trim().length < 50) {
      console.log(`PDF "${file.name}" sem texto extraível por pdfjs, tentando OCR...`);
      try {
        const { extractTextFromPDF } = await import('./utils/ocr');
        fullText = await extractTextFromPDF(file);
        console.log(`OCR extraiu ${fullText.trim().length} caracteres`);
      } catch (ocrErr) {
        console.error('OCR falhou:', ocrErr);
      }
    }

    return fullText;
  } catch (err) {
    console.error(`Erro ao extrair texto do PDF "${file.name}":`, err);
    // Fallback pra OCR em caso de erro no pdfjs
    try {
      const { extractTextFromPDF } = await import('./utils/ocr');
      return await extractTextFromPDF(file);
    } catch (ocrErr) {
      console.error('Fallback OCR também falhou:', ocrErr);
      return '';
    }
  }
}

/**
 * Extrai texto de um arquivo Word (.docx) usando mammoth.js.
 */
async function extractDocxText(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    console.log(`DOCX "${file.name}": extraídos ${result.value.length} caracteres`);
    return result.value;
  } catch (err) {
    console.error(`Erro ao extrair texto do DOCX "${file.name}":`, err);
    return '';
  }
}

/**
 * Estima tokens com base em 1 token ≈ 4 caracteres
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncamento Inteligente:
 * Mantém o início do documento e busca parágrafos com palavras-chave vitais
 * se o limite for ultrapassado.
 */
export function truncateByTokens(text: string, maxTokens: number): string {
  if (estimateTokens(text) <= maxTokens) return text;
  
  const maxChars = maxTokens * 4;
  const keywords = ['resumo', 'objetivo', 'meta', 'financeiro', 'risco', 'escopo', 'conclusão', 'auditoria'];
  
  const paragraphs = text.split(/\n\s*\n|\r\n\s*\r\n/);
  let relevantText = '';
  let remainingChars = maxChars;

  // 1. Capturar o início (15% do limite permitido)
  const introLimit = Math.floor(maxChars * 0.15);
  let initialContent = '';
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if ((initialContent.length + p.length) < introLimit) {
      initialContent += p + '\n\n';
      paragraphs[i] = ''; // Marca como consumido
    } else {
      break;
    }
  }
  
  relevantText += initialContent;
  remainingChars -= initialContent.length;

  // 2. Buscar parágrafos com palavras-chave relevantes
  for (let i = 0; i < paragraphs.length; i++) {
    if (remainingChars <= 0) break;
    const p = paragraphs[i];
    if (p.length === 0) continue; 
    
    const pLower = p.toLowerCase();
    const hasKeyword = keywords.some(k => pLower.includes(k));
    
    if (hasKeyword) {
      if (p.length <= remainingChars) {
        relevantText += p + '\n\n';
        remainingChars -= p.length + 2;
      } else {
        relevantText += p.substring(0, remainingChars) + '...\n\n';
        remainingChars = 0;
      }
      paragraphs[i] = ''; // Marca como consumido
    }
  }

  // 3. Se ainda sobrar espaço, preenche sequencialmente
  if (remainingChars > 100) {
    for (let i = 0; i < paragraphs.length; i++) {
      if (remainingChars <= 0) break;
      const p = paragraphs[i];
      if (p.length === 0) continue;
      
      if (p.length <= remainingChars) {
        relevantText += p + '\n\n';
        remainingChars -= p.length + 2;
      } else {
        relevantText += p.substring(0, remainingChars) + '...\n\n';
        remainingChars = 0;
      }
    }
  }
  
  return relevantText + "\n\n[AVISO: TEXTO TRUNCADO POR LIMITE DE TOKENS DA IA]";
}

// Senhas gerenciadas no Supabase (tabela access_passwords)

const LoadingOverlay = ({ isLoading, message = "Processando..." }: { isLoading: boolean; message?: string }) => {
  const [showTimeout, setShowTimeout] = React.useState(false);
  
  React.useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setShowTimeout(true);
        console.warn('Loading excedeu o tempo limite e pode estar travado.');
      }, 10000);
      
      return () => clearTimeout(timer);
    } else {
      setShowTimeout(false);
    }
  }, [isLoading]);
  
  if (!isLoading) return null;
  
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm p-4">
      <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-4" />
      <p className="text-white text-center font-bold text-lg mb-2">
        {showTimeout ? 'A conexão está demorando mais que o esperado...' : message}
      </p>
      {showTimeout && (
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-xl"
        >
          Recarregar Página
        </button>
      )}
    </div>
  );
};

const App: React.FC = () => {
  // ── Auth ──
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [credits, setCredits] = useState(0);
  const [authView, setAuthView] = useState<'login' | 'register' | 'buy'>('login');
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
  const [selectedPackage, setSelectedPackage] = useState(CREDIT_PACKAGES[2]); // Profissional padrão

  // ── App ──
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisModes, setAnalysisModes] = useState<AnalysisMode[]>(['IATF']);
  const [savedToDb, setSavedToDb] = useState<boolean | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(localStorage.getItem('session_token'));
  const [forceBypass, setForceBypass] = useState(false);

  // Controle de montagem para evitar setState em componente desmontado
  const isMounted = React.useRef(true);

  React.useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // Failsafe: Reset forçado se loading travar por mais de 30 segundos
  React.useEffect(() => {
    if (loginLoading) {
      const timer = setTimeout(() => {
        console.warn('Forçando reset do loading state após 30s');
        if (isMounted.current) {
          setLoginLoading(false);
          setLoginError('Tempo limite excedido. Tente novamente.');
        }
      }, 30000);
      
      return () => clearTimeout(timer);
    }
  }, [loginLoading]);

  // ── Constantes e Derivados ──
  const MAX_TOKENS = 3500;
  const estimatedCostTokens = Math.ceil(files.reduce((acc, file) => acc + (file.text.length / 4), 0));
  const willTruncate = estimatedCostTokens > MAX_TOKENS;

  // ── Session Heartbeat & Recovery ──
  React.useEffect(() => {
    // Reset preventivo para garantir que a UI nunca inicie travada (Loading infinito)
    setLoginLoading(false);
    setLoading(false);

    const recoveredToken = localStorage.getItem('session_token');
    const recoveredUserId = localStorage.getItem('user_id');

    if (recoveredToken && recoveredUserId) {
      updateHeartbeat(recoveredToken).then(async valid => {
        if (valid) {
          const { credits: c } = await checkAccessStatus(recoveredUserId);
          setCredits(c);
          setIsAuthenticated(true);
          setSessionToken(recoveredToken);
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
            const { credits: c } = await checkAccessStatus(currentUserId);
            setCredits(c);
          }
        });
      }
    }, 60000);

    // Adicionar listener de erro global do Supabase
    const handleAuthError = (e: Event) => {
      const error = (e as CustomEvent).detail;
      console.error('Auth error detected:', error);
      if (error?.message?.includes('session')) {
        handleLogout();
        setLoginError('Sessão expirada. Faça login novamente.');
      }
    };
    
    window.addEventListener('supabase-auth-error', handleAuthError);

    return () => {
      clearInterval(interval);
      window.removeEventListener('supabase-auth-error', handleAuthError);
    };
  }, [isAuthenticated]);

  const handleLogout = async () => {
    if (!isMounted.current) return;
    setLoginLoading(true);
    try {
      const currentToken = sessionToken || localStorage.getItem('session_token');
      if (currentToken) {
        // Timeout de segurança no logout
        await Promise.race([
          clearSession(currentToken),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout no logout')), 5000))
        ]);
      }
    } catch (e) {
      console.error('Erro no logout seguro:', e);
    } finally {
      if (isMounted.current) {
        setIsAuthenticated(false);
        setCredits(0);
        setSessionToken(null);
        setCurrentUser(null);
        setAuthView('login');
        setFiles([]);
        setSummary(null);
        setLoginLoading(false);
        setLoading(false);
      }
    }
  };

  const performLogin = async (username: string, password: string) => {
    if (!isMounted.current) return false;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const userData = await Promise.race([
        validateLogin(username.trim(), password.trim()),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout na validação de login')), 10000))
      ]) as UserData | null;
      
      if (userData && isMounted.current) {
        const token = await Promise.race([
          registerSession(userData.id, navigator.userAgent),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao registrar sessão')), 10000))
        ]) as string | null;

        if (token && isMounted.current) {
          setSessionToken(token);
          setCurrentUser(userData);
          const { credits: c } = await checkAccessStatus(userData.id);
          setCredits(c);
          setIsAuthenticated(true);
          return true;
        } else if (isMounted.current) {
          setLoginError('Usuário já logado em outro dispositivo. Aguarde 5 minutos ou deslogue da outra sessão.');
        }
      } else if (isMounted.current) {
        setLoginError('Senha inválida. Verifique e tente novamente.');
      }
    } catch (error: any) {
      if (!isMounted.current) return false;
      console.error('Falha no login:', error);
      setLoginError(error.message || 'Erro de conexão. Tente novamente.');
    } finally {
      // GARANTE a limpeza do estado de loading
      if (isMounted.current) {
        setLoginLoading(false);
      }
    }
    return false;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim() || !loginPassword.trim()) return;
    await performLogin(loginUsername, loginPassword);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regPassword.trim() || !regEmail.trim()) return;
    if (!isMounted.current) return;
    
    setLoginLoading(true);
    setLoginError(null);
    try {
      const userData = await Promise.race([
        registerUser(regUsername.trim(), regPassword.trim(), regEmail.trim()),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao registrar usuário')), 10000))
      ]) as UserData | null;

      if (userData && isMounted.current) {
        // NÃO chama performLogin - faz o login diretamente para evitar conflito de estado
        const token = await Promise.race([
          registerSession(userData.id, navigator.userAgent),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao registrar sessão depois do cadastro')), 10000))
        ]) as string | null;

        if (token && isMounted.current) {
          setSessionToken(token);
          setCurrentUser(userData);
          const { credits: c } = await checkAccessStatus(userData.id);
          setCredits(c);
          setIsAuthenticated(true);
        } else if (isMounted.current) {
          setLoginError('Usuário criado, mas já logado em outro dispositivo.');
        }
      } else if (isMounted.current) {
        setLoginError('Erro ao criar usuário. Tente novamente.');
      }
    } catch (err: any) {
      if (!isMounted.current) return;
      console.error('Falha no cadastro:', err);
      setLoginError(err.message || 'Erro ao realizar cadastro.');
    } finally {
      // GARANTE limpeza do loading no finally
      if (isMounted.current) {
        setLoginLoading(false);
      }
    }
  };

  const handleBuyCredits = async () => {
    if (!currentUser) return;
    setPaymentLoading(true);
    setLoginError(null);
    try {
      const payment = await generatePixPayment(currentUser.id, selectedPackage.amount);
      if (payment) {
        setActivePayment(payment);
      } else {
        setLoginError('Erro ao gerar cobrança PIX. Tente novamente.');
      }
    } finally {
      setPaymentLoading(false);
    }
  };

  if (!isAuthenticated || authView === 'buy') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <LoadingOverlay isLoading={loginLoading} message="Autenticando de forma segura..." />
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-600 rounded-2xl shadow-2xl mb-4">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">App Auditoria</h1>
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

          {authView === 'buy' && (
            <div className="bg-slate-800 rounded-2xl p-6 shadow-2xl border border-slate-700 space-y-5 animate-fade-in">
              {/* Header */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => { setAuthView('login'); setActivePayment(null); setLoginError(null); }}
                  className="flex items-center gap-1 text-slate-400 hover:text-white text-[10px] font-black uppercase"
                >
                  <ArrowLeft className="w-3 h-3" /> Voltar
                </button>
                <div className="flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-yellow-400" />
                  <span className="text-yellow-400 font-black text-sm">{credits} crédito{credits !== 1 ? 's' : ''}</span>
                </div>
              </div>

              <h2 className="text-white font-black uppercase tracking-widest text-sm">Comprar Créditos</h2>
              <p className="text-slate-400 text-xs">Cada análise consome 1 crédito.</p>

              {/* Pacotes */}
              {!activePayment ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    {CREDIT_PACKAGES.map((pkg) => (
                      <button
                        key={pkg.amount}
                        onClick={() => setSelectedPackage(pkg)}
                        className={`flex flex-col p-3 rounded-xl border-2 text-left transition-all ${
                          selectedPackage.amount === pkg.amount
                            ? 'border-red-500 bg-red-900/20'
                            : 'border-slate-600 bg-slate-900 hover:border-slate-400'
                        }`}
                      >
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{pkg.label}</span>
                        <span className="text-white font-black text-lg mt-1">R$ {pkg.amount.toFixed(2)}</span>
                        <div className="flex items-center gap-1 mt-1">
                          <Coins className="w-3 h-3 text-yellow-400" />
                          <span className="text-yellow-400 text-[10px] font-black">{pkg.credits} crédito{pkg.credits !== 1 ? 's' : ''}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={handleBuyCredits}
                    disabled={paymentLoading}
                    className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-black py-3 px-4 rounded-xl shadow-lg transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                  >
                    {paymentLoading ? (
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ShoppingCart className="w-4 h-4" />
                    )}
                    {paymentLoading ? 'Gerando PIX...' : `Pagar R$ ${selectedPackage.amount.toFixed(2)} via PIX`}
                  </button>
                </div>
              ) : (
                /* Tela de pagamento ativo */
                <div className="space-y-4">
                  <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-center space-y-2">
                    {activePayment.pix_qr_code_base64 ? (
                      <img 
                        src={`data:image/png;base64,${activePayment.pix_qr_code_base64}`} 
                        alt="QR Code PIX" 
                        className="w-32 h-32 mx-auto rounded-lg bg-white p-2"
                      />
                    ) : (
                      <QrCode className="w-20 h-20 text-slate-400 mx-auto" />
                    )}
                    <p className="text-white font-black text-sm">{selectedPackage.credits} créditos por R$ {selectedPackage.amount.toFixed(2)}</p>
                    <p className="text-slate-400 text-[10px]">PIX Copia e Cola:</p>
                    <div className="bg-slate-800 rounded-lg p-2 text-[9px] text-slate-300 font-mono break-all line-clamp-3">
                      {activePayment.pix_qr_code}
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(activePayment?.pix_qr_code || '')}
                      className="text-[10px] text-slate-400 hover:text-white font-black uppercase flex items-center justify-center gap-1 w-full"
                    >
                      <ExternalLink className="w-3 h-3" /> Copiar Código PIX
                    </button>
                    <div className="mt-4 pt-4 border-t border-slate-800 opacity-60 flex flex-col items-center gap-1">
                       <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-1" />
                       <span className="text-[9px] uppercase tracking-widest text-slate-400">Liberação automática após PIX</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setActivePayment(null)}
                    className="w-full text-slate-500 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest"
                  >
                    ← Escolher outro pacote
                  </button>
                </div>
              )}

              {loginError && (
                <div className="flex items-center gap-2 bg-red-900/30 border border-red-800 rounded-xl p-3">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <p className="text-red-400 text-xs font-bold">{loginError}</p>
                </div>
              )}

              <button
                onClick={handleLogout}
                className="w-full text-slate-600 hover:text-slate-300 text-[10px] font-black uppercase tracking-widest"
              >
                Sair do Sistema
              </button>
            </div>
          )}

          <p className="text-center text-slate-600 text-[10px] mt-6 uppercase tracking-widest">
            App Auditoria
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
    setLoading(true);
    const fileList = Array.from(uploadedFiles) as File[];
    
    try {
      const filePromises = fileList.map(async (file) => {
        const fileName = file.name.toLowerCase();
        const isPdf = file.type === 'application/pdf' || fileName.endsWith('.pdf');
        const isDocx = file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || fileName.endsWith('.docx');
        const isDoc = file.type === 'application/msword' || fileName.endsWith('.doc');

        if (isPdf) {
          // Extrair texto do PDF usando pdfjs-dist (com fallback OCR)
          const text = await extractPdfText(file);
          return { name: file.name, text };
        } else if (isDocx) {
          // Extrair texto do Word (.docx) usando mammoth
          const text = await extractDocxText(file);
          return { name: file.name, text };
        } else if (isDoc) {
          // Arquivo .doc antigo - não suportado nativamente
          return { name: file.name, text: '[Formato .doc não suportado - por favor converta para .docx ou .pdf]' };
        } else {
          // Para arquivos de texto comum (.txt, .csv, etc.)
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
        }
      });

      const loadedFiles = await Promise.all(filePromises);
      // Adiciona novos arquivos à lista existente sem disparar análise
      setFiles(prev => [...prev, ...loadedFiles]);
      // Limpa o resumo antigo se estiver adicionando novos arquivos
      setSummary(null);
    } catch (err) {
      console.error(err);
      setError("Erro ao carregar arquivos. Verifique se são formatos válidos.");
    } finally {
      setLoading(false);
    }
    // Limpa o input para permitir selecionar os mesmos arquivos se necessário
    event.target.value = '';
  };

  const startAnalysis = async () => {
    if (files.length === 0) {
      setError("Por favor, anexe ao menos um arquivo antes de iniciar.");
      return;
    }

    if (!currentUser) return;

    // Consome 1 crédito antes de iniciar (validação no backend)
    const consumed = await consumeCredit(currentUser.id);
    if (!consumed) {
      setError("Você não possui créditos suficientes. Adquira mais créditos para continuar.");
      setAuthView('buy');
      return;
    }
    setCredits(prev => Math.max(0, prev - 1));

    setLoading(true);
    setError(null);
    setSavedToDb(null);
    try {
      // Aplica limite de tokens combinado
      const processedFiles = files.map(file => {
        // Redução proporcional se houver mais de um arquivo
        const fileProportion = (file.text.length / 4) / (estimatedCostTokens || 1);
        const tokensForThisFile = files.length === 1 ? MAX_TOKENS : Math.floor(MAX_TOKENS * fileProportion);
        return {
          ...file,
          text: truncateByTokens(file.text, tokensForThisFile)
        };
      });

      const analysis = await analyzeDocuments(processedFiles, analysisModes);
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
      setForceBypass(false);
    }
  };

  const handleStartAnalysisClick = () => {
    // Agora não precisamos bloquear via bypass de 100k,
    // pois o sistema faz truncamento automaticamente para os 3.5k.
    startAnalysis();
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
      doc.rect(0, 0, 210, 18, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('App Auditoria', 105, 8, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(239, 68, 68); // red-500
      doc.text('SOLUÇÕES EMPREENDEDORAS', 105, 13, { align: 'center' });
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text(`GERADO EM: ${dateStr} às ${timeStr}`, 105, 16.5, { align: 'center' });

      // Seção de Panorama
      doc.setTextColor(15, 23, 42);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PANORAMA DE CONFORMIDADE', 14, 25);
      
      // Linha decorativa
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.5);
      doc.line(14, 26.5, 196, 26.5);

      // Coluna Esquerda: Pontuações
      doc.setFontSize(11);
      doc.text(`Pontuação Geral: ${summary.overallScore}%`, 14, 32);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      
      let currentY = 37;
      if (analysisModes.includes('IATF')) {
        doc.text(`IATF 16949: ${summary.complianceProgress.iatf}%`, 14, currentY);
        currentY += 4.5;
      }
      if (analysisModes.includes('ISO 14001')) {
        doc.text(`ISO 14001: ${summary.complianceProgress.iso14001}%`, 14, currentY);
        currentY += 4.5;
      }
      if (analysisModes.includes('ISO 9001 + E1')) {
        doc.text(`ISO 9001 + E1: ${summary.complianceProgress.iso9001}%`, 14, currentY);
        currentY += 4.5;
      }

      // Coluna Direita: Desvios
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('SÍNTESE DE DESVIOS:', 120, 32);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      
      // Simula badges/cores usando texto (Limitações do autoTable e fontes básicas jsPDF)
      doc.setTextColor(220, 38, 38); // red-600 para críticos
      doc.text(`• Críticos: ${summary.criticalIssues}`, 120, 37);
      
      doc.setTextColor(234, 88, 12); // orange-600 para maiores
      doc.text(`• Maiores: ${summary.majorIssues}`, 120, 41.5);
      
      doc.setTextColor(202, 138, 4); // yellow-600 para menores
      doc.text(`• Menores: ${summary.minorIssues}`, 120, 46);

      // Tabela de Achados
      (doc as any).autoTable({
        startY: 50,
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
          cellPadding: 2,
          overflow: 'linebreak',
          cellWidth: 'wrap'
        },
        columnStyles: {
          0: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
          1: { cellWidth: 32 },
          2: { cellWidth: 62 },
          3: { cellWidth: 62 },
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { top: 20 }
      });

      // Documentos Analisados e Isenção de Responsabilidade
      let finalY = (doc as any).lastAutoTable.finalY + 15;

      if (files.length > 0) {
        doc.setFontSize(9);
        doc.setTextColor(50, 50, 50);
        doc.setFont('helvetica', 'bold');
        doc.text('Documentos Analisados:', 14, finalY);
        doc.setFont('helvetica', 'normal');
        
        const fileNames = files.map(f => f.name).join(', ');
        const splitFileNames = doc.splitTextToSize(fileNames, 180);
        doc.text(splitFileNames, 14, finalY + 5);
        
        finalY = finalY + 5 + (splitFileNames.length * 4) + 10;
      }

      if (finalY < 270) {
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.setFont('helvetica', 'bold');
        doc.text('AVISO LEGAL:', 14, finalY);
        doc.setFont('helvetica', 'normal');
        const disclaimer = [
          "A Soluções Empreendedoras desenvolveu o App Auditoria para apoiar equipes de gestão. A empresa se exime de",
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
        doc.text(`Página ${i} de ${pageCount} | App Auditoria`, 105, 285, { align: 'center' });
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
      <div className="flex justify-end items-center mb-4 gap-3">
        {currentUser && (
           <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 mr-1 opacity-70">
             Logado como: {currentUser.login}
           </span>
        )}
        <button
          onClick={() => setAuthView('buy')}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-yellow-500/20 shadow-lg"
        >
          <Coins className="w-3 h-3" />
          {credits} crédito{credits !== 1 ? 's' : ''}
        </button>
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
                    Coloque aqui seus documentos para análise do App Auditoria:
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

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                        Estimativa de Tokens (Conteúdo)
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${willTruncate ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {estimatedCostTokens.toLocaleString('pt-BR')} / {MAX_TOKENS.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    {/* Barra de progresso dos tokens */}
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full transition-all ${willTruncate ? 'bg-amber-500' : 'bg-emerald-500'}`} 
                        style={{ width: `${Math.min((estimatedCostTokens / MAX_TOKENS) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {willTruncate && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                      <p className="text-[10px] text-amber-700 font-bold text-center leading-relaxed">
                        ⚠️ Documento Longo (Limitação Ativa)<br/>
                        A IA analisará as seções mais relevantes do documento devido ao limite de foco ({MAX_TOKENS} tokens).
                      </p>
                    </div>
                  )}

                  {!loading && (
                    credits > 0 ? (
                      <button 
                        onClick={handleStartAnalysisClick}
                        className={`w-full font-black py-4 px-4 rounded-xl shadow-lg transition-all transform active:scale-[0.98] uppercase text-xs tracking-widest flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white shadow-red-100`}
                      >
                        <Play className="w-4 h-4 fill-current" /> Iniciar Verificação Técnica
                      </button>
                    ) : (
                      <button 
                        onClick={() => setAuthView('buy')}
                        className="w-full bg-yellow-500 hover:bg-yellow-600 text-slate-900 font-black py-4 px-4 rounded-xl shadow-lg transition-all uppercase text-xs tracking-widest flex items-center justify-center gap-2"
                      >
                        <Coins className="w-4 h-4" />
                        Sem créditos — Comprar
                      </button>
                    )
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
                
                <div className={`grid gap-2 ${analysisModes.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {analysisModes.includes('IATF') && (
                    <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                      <div className="text-[10px] font-bold text-red-200 uppercase mb-1 opacity-60">IATF</div>
                      <div className="text-xl font-black">{summary.complianceProgress.iatf}%</div>
                    </div>
                  )}
                  {analysisModes.includes('ISO 14001') && (
                    <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                      <div className="text-[10px] font-bold text-green-300 uppercase mb-1 opacity-60">ISO 14001</div>
                      <div className="text-xl font-black">{summary.complianceProgress.iso14001}%</div>
                    </div>
                  )}
                  {analysisModes.includes('ISO 9001 + E1') && (
                    <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                      <div className="text-[10px] font-bold text-blue-300 uppercase mb-1 opacity-60">ISO 9001 + E1</div>
                      <div className="text-xl font-black">{summary.complianceProgress.iso9001}%</div>
                    </div>
                  )}
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
                  Bem-vindo ao <span className="text-red-600 font-bold">App Auditoria</span>. Selecione o escopo da análise, faça o upload dos seus documentos e deixe nossa IA validar sua conformidade técnica em tempo real.
                </p>
                <p className="text-slate-400 mt-6 text-[11px] leading-relaxed border-t border-slate-100 pt-6 italic">
                  As análises possuem limite de processamento em tokens, informado no momento do upload. Cada análise corresponde ao consumo de 1 crédito. O usuário é responsável por verificar essas informações antes de confirmar o envio. Caso o arquivo ultrapasse o limite estabelecido, recomenda-se reduzir o conteúdo (por exemplo, diminuir o número de páginas) até que esteja dentro do limite permitido.
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
                      A Soluções Empreendedoras desenvolveu o App Auditoria com o objetivo de contribuir e apoiar a equipe do Sistema de Gestão da Qualidade, APQP e demais atividades correlatas.
                      {"\n\n"}
                      A empresa se exime de qualquer responsabilidade quanto à utilização das informações disponibilizadas no aplicativo, sendo de responsabilidade exclusiva do usuário a correta aplicação, análise e interpretação dos dados contidos no App Auditoria.
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
