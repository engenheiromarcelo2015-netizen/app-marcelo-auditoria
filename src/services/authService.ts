import { supabase } from './supabaseClient';

export interface UserData {
  id: string;
  login: string;
  email?: string;
  credits: number;
}

/**
 * Valida o login e a senha consultando a tabela access_passwords no Supabase.
 */
export async function validateLogin(login: string, password: string): Promise<UserData | null> {
  const { data, error } = await supabase
    .from('access_passwords')
    .select('id, login, email, credits')
    .eq('login', login)
    .eq('password', password)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] Erro ao validar login/senha:', error.message);
    return null;
  }

  return data;
}

/**
 * Registra um novo usuário com 1 crédito grátis.
 */
export async function registerUser(login: string, password: string, email: string): Promise<UserData | null> {
  const { data, error } = await supabase
    .from('access_passwords')
    .insert([{
      login,
      password,
      email,
      active: true,
      credits: 1, // 1 crédito grátis na primeira análise
    }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Este login ou e-mail já está em uso.');
    }
    console.error('[Supabase] Erro ao registrar usuário:', error.message);
    return null;
  }

  return data;
}

/**
 * Verifica o saldo de créditos do usuário.
 */
export async function checkAccessStatus(userId: string): Promise<{ credits: number }> {
  const { data, error } = await supabase
    .from('access_passwords')
    .select('credits')
    .eq('id', userId)
    .single();

  if (error || !data) return { credits: 0 };
  return { credits: data.credits ?? 0 };
}

/**
 * Consome 1 crédito do usuário ao iniciar uma análise.
 * Retorna true se bem-sucedido, false se sem créditos.
 */
export async function consumeCredit(userId: string): Promise<boolean> {
  const { data: user, error: fetchError } = await supabase
    .from('access_passwords')
    .select('credits')
    .eq('id', userId)
    .single();

  if (fetchError || !user || user.credits <= 0) {
    return false;
  }

  const { error } = await supabase
    .from('access_passwords')
    .update({ credits: user.credits - 1 })
    .eq('id', userId);

  if (error) {
    console.error('[Supabase] Erro ao consumir crédito:', error.message);
    return false;
  }

  return true;
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

  const { data: userData } = await supabase
    .from('access_passwords')
    .select('active')
    .eq('id', data.user_id)
    .single();

  if (!userData || !userData.active) return false;

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
