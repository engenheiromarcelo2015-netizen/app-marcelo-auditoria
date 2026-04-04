import { supabase } from './supabaseClient';

export interface AuditLogEntry {
  action: string;
  resource?: string;
  details?: any;
}

export async function auditLog(entry: AuditLogEntry) {
  try {
    const userId = localStorage.getItem('user_id');
    const userAgent = navigator.userAgent;

    // Apenas inserir - imutabilidade garantida por trigger no BD
    const { error } = await supabase.from('audit_logs').insert([{
      user_id: userId || null,
      action: entry.action,
      resource: entry.resource || null,
      details: entry.details || {},
      user_agent: userAgent
    }]);

    if (error) {
      console.error('[AuditLog] Erro ao salvar log de auditoria:', error.message);
    }
  } catch (err) {
    console.error('[AuditLog] Falha inesperada ao tentar salvar log:', err);
  }
}
