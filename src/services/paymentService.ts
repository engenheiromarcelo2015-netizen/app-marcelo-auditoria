import { supabase } from './supabaseClient';

export interface PaymentData {
  id: string;
  user_id: string;
  amount: number;
  status: 'pending' | 'completed' | 'cancelled';
  pix_qr_code: string;
  created_at: string;
}

/**
 * Gera um pagamento PIX simulado para o usuário.
 */
export async function generatePixPayment(userId: string, amount: number = 29.90): Promise<PaymentData | null> {
  // Simulando um payload de PIX Copia e Cola (Payload estático para demonstração)
  // Em produção, você chamaria a API do seu gateway aqui.
  const pixPayload = `00020126580014br.gov.bcb.pix0136marcelodias@pix.com.br5204000053039865405${amount.toFixed(2)}5802BR5912Marcelo Dias6008SAO PAULO62070503***6304E2CA`;

  const { data, error } = await supabase
    .from('payments')
    .insert([{
      user_id: userId,
      amount: amount,
      status: 'pending',
      pix_qr_code: pixPayload
    }])
    .select()
    .single();

  if (error) {
    console.error('[Supabase] Erro ao gerar pagamento:', error.message);
    return null;
  }

  return data;
}

/**
 * Simula a confirmação de um pagamento.
 * Em produção, isso seria feito via Webhook do seu banco/gateway.
 */
export async function simulatePaymentSuccess(paymentId: string, userId: string): Promise<boolean> {
  // 1. Atualiza o status do pagamento para completed
  const { error: paymentError } = await supabase
    .from('payments')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', paymentId);

  if (paymentError) {
    console.error('[Supabase] Erro ao atualizar pagamento:', paymentError.message);
    return false;
  }

  // 2. Libera o acesso para o usuário (ex: +30 dias a partir de hoje)
  const paidUntil = new Date();
  paidUntil.setDate(paidUntil.getDate() + 30);

  const { error: userError } = await supabase
    .from('access_passwords')
    .update({ paid_until: paidUntil.toISOString() })
    .eq('id', userId);

  if (userError) {
    console.error('[Supabase] Erro ao atualizar créditos do usuário:', userError.message);
    return false;
  }

  return true;
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
