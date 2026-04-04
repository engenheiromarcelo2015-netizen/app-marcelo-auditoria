import { supabase } from './supabaseClient';

export interface UserData {
  id: string;
  login: string;
  email?: string;
  credits: number;
}

/**
 * Valida o login e a senha usando conexão segura e blindada.
 */
export async function validateLogin(login: string, password: string): Promise<UserData | null> {
  const { data, error } = await supabase.rpc('secure_login', {
    p_login: login,
    p_password: password
  });

  if (error || !data) {
    return null;
  }
  return data;
}

/**
 * Registra um novo usuário.
 */
export async function registerUser(login: string, password: string, email: string): Promise<UserData | null> {
  const { data, error } = await supabase.rpc('secure_register', {
    p_login: login,
    p_password: password,
    p_email: email
  });

  if (error || !data) {
    throw new Error('Este login ou e-mail já está em uso.');
  }

  return data;
}

/**
 * Verifica o saldo de créditos do usuário.
 */
export async function checkAccessStatus(userId: string): Promise<{ credits: number }> {
  const { data, error } = await supabase.rpc('secure_check_credits', {
    p_user_id: userId
  });

  if (error || data === null) return { credits: 0 };
  return { credits: data };
}

/**
 * Consome 1 crédito do usuário.
 */
export async function consumeCredit(userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('secure_consume_credit', {
    p_user_id: userId
  });

  if (error || data === null) return false;
  return data;
}

/**
 * Registra uma nova sessão para o usuário.
 */
export async function registerSession(userId: string, userAgent: string): Promise<string | null> {
  const sessionToken = crypto.randomUUID();
  const heartbeatLimit = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: existingSession } = await supabase
    .from('user_sessions')
    .select('id, last_active, session_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingSession) {
    if (new Date(existingSession.last_active) > new Date(heartbeatLimit)) {
      const savedToken = localStorage.getItem('session_token');
      if (savedToken === existingSession.session_token) {
        return savedToken;
      }
      return null;
    }
    await supabase.from('user_sessions').delete().eq('user_id', userId);
  }

  const { error } = await supabase
    .from('user_sessions')
    .insert([{
      user_id: userId,
      session_token: sessionToken,
      user_agent: userAgent,
      last_active: new Date().toISOString()
    }]);

  if (error) {
    console.error('[Supabase] Erro ao registrar sessão:', error.message);
    return null;
  }

  localStorage.setItem('session_token', sessionToken);
  localStorage.setItem('user_id', userId);
  return sessionToken;
}

/**
 * Atualiza o heartbeat da sessão.
 */
export async function updateHeartbeat(sessionToken: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('user_sessions')
    .update({ last_active: new Date().toISOString() })
    .eq('session_token', sessionToken)
    .select('id, user_id')
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  const { data: activeResult } = await supabase.rpc('secure_check_active', {
    p_user_id: data.user_id
  });

  if (!activeResult) return false;

  return true;
}

/**
 * Remove a sessão do banco de dados (Logout).
 */
export async function clearSession(sessionToken: string): Promise<void> {
  await supabase
    .from('user_sessions')
    .delete()
    .eq('session_token', sessionToken);
  
  localStorage.removeItem('session_token');
  localStorage.removeItem('user_id');
}
