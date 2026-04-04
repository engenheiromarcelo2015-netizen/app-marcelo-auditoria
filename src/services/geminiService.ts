import { DocumentSummary } from "../types";

export type AnalysisMode = 'IATF' | 'ISO 14001' | 'ISO 9001 + E1';

export const analyzeDocuments = async (
  files: { name: string; text: string }[],
  modes: AnalysisMode[]
): Promise<DocumentSummary> => {
  try {
    console.log("Enviando requisição segura para o backend...");
    
    // Process text locally before sending the payload
    const processedFiles = files.map(f => {
      // Small limit string so it doesn't break Vercel edge function limits
      const textoLimitado = f.text.length > 8000 ? f.text.substring(0, 8000) + "..." : f.text;
      return {
        name: f.name,
        text: textoLimitado
      };
    });

    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ files: processedFiles, modes })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error || `Erro HTTP no servidor: ${response.status}`);
    }

    const result = await response.json();
    return result as DocumentSummary;
  } catch (apiError: any) {
    console.error("Erro na Análise (via backend):", apiError);
    throw new Error(apiError.message || "Erro desconhecido ao comunicar com o servidor.");
  }
};