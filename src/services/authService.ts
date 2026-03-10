import { supabase } from './supabaseClient';

/**
 * Valida uma senha consultando a tabela access_passwords no Supabase.
 * Retorna true se a senha existir e estiver ativa.
 */
export async function validatePassword(password: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('access_passwords')
    .select('id')
    .eq('password', password)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('[Supabase] Erro ao validar senha:', error.message);
    return false;
  }

  return data !== null;
}
