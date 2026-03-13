import { supabase } from './supabaseClient';

export interface UserData {
  id: string;
  login: string;
}

/**
 * Valida o login e a senha consultando a tabela access_passwords no Supabase.
 * Retorna os dados do usuário se a combinação existir e estiver ativa.
 */
export async function validateLogin(login: string, password: string): Promise<UserData | null> {
  const { data, error } = await supabase
    .from('access_passwords')
    .select('id, login')
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
 * Registra uma nova sessão para o usuário ou valida uma existente.
 * Se houver uma sessão ativa de outro dispositivo dentro do limite do heartbeat (5min), bloqueia.
 */
export async function registerSession(userId: string, userAgent: string): Promise<string | null> {
  const sessionToken = crypto.randomUUID();
  const heartbeatLimit = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // Busca sessão existente
  const { data: existingSession } = await supabase
    .from('user_sessions')
    .select('id, last_active, session_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingSession) {
    // Se a sessão existente estiver ativa (heartbeat recente), bloqueia novo login
    if (new Date(existingSession.last_active) > new Date(heartbeatLimit)) {
      // Se for o mesmo token (recuperação de estado), permite
      const savedToken = localStorage.getItem('session_token');
      if (savedToken === existingSession.session_token) {
        return savedToken;
      }
      return null; // Usuário já está logado em outro lugar
    }

    // Se a sessão expirou, removemos a antiga antes de criar a nova
    await supabase.from('user_sessions').delete().eq('user_id', userId);
  }

  // Cria nova sessão
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
    .select()
    .maybeSingle();

  if (error || !data) {
    return false;
  }
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
