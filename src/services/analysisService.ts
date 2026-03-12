import { supabase } from './supabaseClient';
import { DocumentSummary, AnalysisResult } from '../types';
import { AnalysisMode } from './geminiService';

export interface SavedAnalysis {
  id: string;
  created_at: string;
  analysis_modes: string[];
  overall_score: number;
  critical_issues: number;
  major_issues: number;
  minor_issues: number;
  iatf_progress: number;
  iso14001_progress: number;
  file_names: string[];
  findings?: AnalysisResult[];
}

/**
 * Salva uma análise completa (sessão + achados) no Supabase.
 * Retorna o ID da análise criada, ou null em caso de erro.
 */
export async function saveAnalysis(
  summary: DocumentSummary,
  analysisModes: AnalysisMode[],
  fileNames: string[]
): Promise<string | null> {
  try {
    // 1. Insere o registro principal da análise
    const { data: analysisData, error: analysisError } = await supabase
      .from('analyses')
      .insert({
        analysis_modes: analysisModes,
        overall_score: summary.overallScore,
        critical_issues: summary.criticalIssues,
        major_issues: summary.majorIssues,
        minor_issues: summary.minorIssues,
        iatf_progress: summary.complianceProgress.iatf,
        iso14001_progress: summary.complianceProgress.iso14001,
        file_names: fileNames,
      })
      .select('id')
      .single();

    if (analysisError) {
      console.error('[Supabase] Erro ao salvar análise:', analysisError.message);
      return null;
    }

    const analysisId = analysisData.id;

    // 2. Insere os achados vinculados à análise
    if (summary.findings.length > 0) {
      const findingsToInsert = summary.findings.map((f) => ({
        analysis_id: analysisId,
        standard: f.standard,
        clause: f.clause,
        severity: f.severity,
        finding: f.finding,
        recommendation: f.recommendation,
      }));

      const { error: findingsError } = await supabase
        .from('findings')
        .insert(findingsToInsert);

      if (findingsError) {
        console.error('[Supabase] Erro ao salvar achados:', findingsError.message);
        // Não retorna null aqui — a análise principal foi salva com sucesso
      }
    }

    return analysisId;
  } catch (err) {
    console.error('[Supabase] Erro inesperado ao salvar:', err);
    return null;
  }
}

/**
 * Retorna as análises mais recentes (sem achados detalhados).
 */
export async function getRecentAnalyses(limit = 10): Promise<SavedAnalysis[]> {
  const { data, error } = await supabase
    .from('analyses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Supabase] Erro ao buscar análises:', error.message);
    return [];
  }

  return data as SavedAnalysis[];
}
