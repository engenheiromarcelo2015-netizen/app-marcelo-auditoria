import { supabase } from './supabaseClient';

/**
 * Valida o login e a senha consultando a tabela access_passwords no Supabase.
 * Retorna true se a combinação existir e estiver ativa.
 */
export async function validateLogin(login: string, password: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('access_passwords')
    .select('id')
    .eq('login', login)
    .eq('password', password)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] Erro ao validar login/senha:', error.message);
    return false;
  }

  return data !== null;
}
