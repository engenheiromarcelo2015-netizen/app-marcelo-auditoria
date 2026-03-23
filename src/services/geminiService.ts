import { DocumentSummary } from "../types";

export type AnalysisMode = 'IATF' | 'ISO 14001' | 'ISO 9001 + E1';

// Lista de modelos gratuitos para fallback
const FREE_MODELS = [
  "openrouter/free",  // Roteador automático (recomendado)
  "meta-llama/llama-4-maverick:free",
  "meta-llama/llama-4-scout:free",
  "nvidia/nemotron-3-nano-30b-a3b:free"
];

export const analyzeDocuments = async (
  files: { name: string; text: string }[],
  modes: AnalysisMode[]
): Promise<DocumentSummary> => {
  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error("Chave OpenRouter não encontrada. Configure VITE_OPENROUTER_API_KEY no arquivo .env");
  }

  const focusDescriptions = modes.map(mode => {
    if (mode === 'IATF') return "IATF 16949 (Qualidade Automotiva - Foco em Riscos e Processos)";
    if (mode === 'ISO 14001') return "ISO 14001 (Gestão Ambiental - Foco em Aspectos e Impactos)";
    if (mode === 'ISO 9001 + E1') return "ISO 9001 + E1 (Qualidade e Requisitos Específicos)";
    return mode;
  }).join(", ");

  // Limita o tamanho do texto para evitar timeout
  const combinedText = files.map(f => {
    const textoLimitado = f.text.length > 8000 ? f.text.substring(0, 8000) + "..." : f.text;
    return `DOCUMENTO: ${f.name}\nCONTEÚDO:\n${textoLimitado}`;
  }).join("\n\n---\n\n");

  const promptText = `
    Você é um Auditor Especialista da Soluções Empreendedoras, focado em ajudar o usuário que esta logado.
    Analise os documentos abaixo com foco nos critérios: ${focusDescriptions}.

    Sua resposta deve ser estritamente em JSON seguindo o esquema fornecido.
    A pontuação (overallScore) deve ser rigorosa (0-100).
    Os achados (findings) devem listar falhas reais encontradas nos documentos em relação às normas selecionadas.

    Responda APENAS com JSON, sem texto adicional.

    Formato JSON esperado:
    {
      "overallScore": number,
      "criticalIssues": number,
      "majorIssues": number,
      "minorIssues": number,
      "findings": [
        {
          "standard": string,
          "clause": string,
          "finding": string,
          "severity": "CRITICAL" | "MAJOR" | "MINOR" | "OBSERVATION",
          "recommendation": string
        }
      ],
      "complianceProgress": {
        "iatf": number,
        "iso14001": number,
        "iso9001": number
      }
    }

    DOCUMENTOS PARA ANÁLISE:
    ${combinedText}
  `;

  // Função para tentar diferentes modelos em caso de falha
  const tryModels = async (modelIndex: number = 0): Promise<any> => {
    if (modelIndex >= FREE_MODELS.length) {
      throw new Error("Todos os modelos gratuitos falharam. Tente novamente mais tarde.");
    }

    const currentModel = FREE_MODELS[modelIndex];
    console.log(`Tentando modelo: ${currentModel}`);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "App Auditoria Marcelo"
        },
        body: JSON.stringify({
          model: currentModel,
          messages: [
            {
              role: "system",
              content: "Você é um auditor especialista em qualidade e normas técnicas. Responda sempre em JSON válido."
            },
            {
              role: "user",
              content: promptText
            }
          ],
          temperature: 0.3,
          max_tokens: 4096
        })
      });

      if (response.status === 404) {
        console.log(`Modelo ${currentModel} não encontrado, tentando próximo...`);
        return tryModels(modelIndex + 1);
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Erro ${response.status}: ${errorData.error?.message || 'Erro desconhecido'}`);
      }

      return await response.json();
      
    } catch (error: any) {
      if (error.message.includes("404") || error.message.includes("not found")) {
        return tryModels(modelIndex + 1);
      }
      throw error;
    }
  };

  try {
    console.log("Enviando requisição para OpenRouter...");
    const data = await tryModels();
    
    const resultText = data.choices[0]?.message?.content;
    
    if (!resultText) {
      throw new Error("Resposta vazia da IA");
    }

    console.log("Resposta recebida, processando...");
    
    // Limpa possíveis marcações e extrai JSON
    let cleanText = resultText.trim();
    cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }
    
    const result = JSON.parse(cleanText);
    
    return {
      overallScore: typeof result.overallScore === 'number' ? result.overallScore : 0,
      criticalIssues: typeof result.criticalIssues === 'number' ? result.criticalIssues : 0,
      majorIssues: typeof result.majorIssues === 'number' ? result.majorIssues : 0,
      minorIssues: typeof result.minorIssues === 'number' ? result.minorIssues : 0,
      findings: Array.isArray(result.findings) ? result.findings : [],
      complianceProgress: {
        iatf: typeof result.complianceProgress?.iatf === 'number' ? result.complianceProgress.iatf : 0,
        iso14001: typeof result.complianceProgress?.iso14001 === 'number' ? result.complianceProgress.iso14001 : 0,
        iso9001: typeof result.complianceProgress?.iso9001 === 'number' ? result.complianceProgress.iso9001 : 0
      }
    };

  } catch (apiError: any) {
    console.error("Erro na API:", apiError);
    
    let mensagemErro = "Falha na IA: ";
    if (apiError.message.includes("429")) {
      mensagemErro += "Muitas requisições. Aguarde 30 segundos e tente novamente.";
    } else if (apiError.message.includes("401") || apiError.message.includes("403")) {
      mensagemErro += "Chave da API inválida. Verifique sua chave do OpenRouter.";
    } else {
      mensagemErro += apiError.message;
    }
    
    throw new Error(mensagemErro);
  }
};
