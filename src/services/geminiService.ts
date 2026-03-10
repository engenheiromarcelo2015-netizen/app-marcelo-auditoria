
import { GoogleGenAI, Type } from "@google/genai";
import { DocumentSummary } from "../types";

export type AnalysisMode = 'IATF' | 'ISO 14001' | 'ISO 9001 + E1';

export const analyzeDocuments = async (
  files: { name: string; text: string }[], 
  modes: AnalysisMode[]
): Promise<DocumentSummary> => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  
  const focusDescriptions = modes.map(mode => {
    if (mode === 'IATF') {
      return "IATF 16949:2016 (Qualidade Automotiva): Verifique mentalidade de risco, planos de contingência, requisitos específicos de clientes e abordagem por processos.";
    } else if (mode === 'ISO 14001') {
      return "ISO 14001:2015 (Gestão Ambiental): Verifique identificação de aspectos e impactos, requisitos legais, objetivos ambientais e perspectiva de ciclo de vida.";
    } else {
      return "ISO 9001:2015 + Emenda 1:2024: Verifique rigorosamente a integração das Mudanças Climáticas nos requisitos 4.1 e 4.2.";
    }
  });

  const targetFocus = `FOCO DA ANÁLISE (${modes.join(' + ')}):\n${focusDescriptions.join('\n')}`;

  const prompt = `
    Você é um Consultor Sênior de Qualidade e Gestão Ambiental da Soluções Empreendedoras.
    O Marcelo Dias precisa de uma análise técnica rigorosa.
    
    ${targetFocus}
    
    Documentos para análise:
    ${files.map(f => `ARQUIVO: ${f.name}\nCONTEÚDO: ${f.text}`).join('\n\n')}
    
    RESPONDA EM PORTUGUÊS (Brasil). Identifique erros, omissões e forneça recomendações práticas.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          overallScore: { type: Type.NUMBER, description: "Pontuação geral de 0 a 100" },
          criticalIssues: { type: Type.NUMBER, description: "Número de falhas críticas" },
          majorIssues: { type: Type.NUMBER, description: "Número de falhas maiores" },
          minorIssues: { type: Type.NUMBER, description: "Número de falhas menores" },
          complianceProgress: {
            type: Type.OBJECT,
            properties: {
              iatf: { type: Type.NUMBER, description: "Progresso IATF 0-100" },
              iso14001: { type: Type.NUMBER, description: "Progresso ISO 14001 0-100" }
            },
            required: ["iatf", "iso14001"]
          },
          findings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                standard: { type: Type.STRING, description: "Norma correspondente" },
                clause: { type: Type.STRING, description: "Número da cláusula correspondente" },
                finding: { type: Type.STRING, description: "Descrição detalhada do erro ou falha encontrada" },
                severity: { type: Type.STRING, description: "CRITICAL, MAJOR, MINOR ou OBSERVATION" },
                recommendation: { type: Type.STRING, description: "Ação corretiva ou recomendação para Marcelo" }
              },
              required: ["standard", "clause", "finding", "severity", "recommendation"]
            }
          }
        },
        required: ["overallScore", "criticalIssues", "majorIssues", "minorIssues", "findings", "complianceProgress"]
      }
    }
  });

  try {
    const text = response.text;
    if (!text) throw new Error("Resposta vazia da IA");
    return JSON.parse(text);
  } catch (e) {
    console.error("Erro ao parsear resposta da IA", e);
    throw new Error("Resposta da IA inválida");
  }
};
