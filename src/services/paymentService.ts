import { supabase } from './supabaseClient';

const SUPABASE_FUNCTIONS_URL = 'https://whiirzvisztjhprxkkoq.supabase.co/functions/v1';

export const CREDIT_PACKAGES = [
  { amount: 1,  credits: 1,  label: 'Starter',    color: 'bg-slate-600' },
  { amount: 5,  credits: 6,  label: 'Básico',      color: 'bg-blue-600' },
  { amount: 10, credits: 13, label: 'Profissional', color: 'bg-red-600' },
  { amount: 20, credits: 27, label: 'Empresarial',  color: 'bg-emerald-600' },
];

export interface PaymentData {
  id: string;
  user_id: string;
  amount: number;
  credits: number;
  status: 'pending' | 'approved' | 'cancelled';
  pix_qr_code: string;
  created_at: string;
}

/**
 * Gera um pagamento PIX via Edge Function.
 */
export async function generatePixPayment(userId: string, amount: number): Promise<PaymentData | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/generate-pix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ user_id: userId, amount }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('[PIX] Erro na Edge Function:', err.error);
      return null;
    }

    const result = await response.json();

    // Retorna o pagamento em formato compatível com o App.tsx
    const { data } = await supabase
      .from('payments')
      .select('*')
      .eq('id', result.payment_id)
      .single();

    return data;
  } catch (err: any) {
    console.error('[PIX] Erro ao gerar pagamento:', err.message);
    return null;
  }
}

/**
 * Simula a confirmação de um pagamento (para testes sem webhook real).
 * Em produção, isso é feito pelo webhook do Mercado Pago automaticamente.
 */
export async function simulatePaymentSuccess(paymentId: string): Promise<boolean> {
  try {
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/pix-webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ payment_id: paymentId, simulate: true }),
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('[PIX] Erro ao simular pagamento:', err.error);
      return false;
    }

    return true;
  } catch (err: any) {
    console.error('[PIX] Erro ao confirmar pagamento:', err.message);
    return false;
  }
}

/**
 * Busca o último pagamento pendente do usuário.
 */
export async function getLatestPendingPayment(userId: string): Promise<PaymentData | null> {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] Erro ao buscar pagamento pendente:', error.message);
    return null;
  }

  return data;
}
