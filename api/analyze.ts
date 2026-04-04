
export default async function handler(req: any, res: any) {
  // CORS rules for local testing against Vercel Edge/Serverless
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const { files, modes } = req.body;

    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "API Key não configurada no servidor (.env)." });
    }

    if (!files || !modes) {
      return res.status(400).json({ error: "Requisição inválida. Faltam arquivos ou modos de análise." });
    }

    const focusDescriptions = modes.map((mode: string) => {
      if (mode === 'IATF') return "IATF 16949 (Qualidade Automotiva)";
      if (mode === 'ISO 14001') return "ISO 14001 (Gestão Ambiental)";
      if (mode === 'ISO 9001 + E1') return "ISO 9001 + E1 (Qualidade)";
      return mode;
    }).join(", ");

    const combinedText = files.map((f: any) => {
      const textoLimitado = f.text?.length > 8000 ? f.text.substring(0, 8000) + "..." : f.text;
      return `DOCUMENTO: ${f.name}\nCONTEÚDO:\n${textoLimitado}`;
    }).join("\n\n---\n\n");

    const promptText = `
    Você é um Auditor Especialista da Soluções Empreendedoras.
    Analise os documentos abaixo com foco nos critérios: ${focusDescriptions}.

    Sua resposta deve ser estritamente em JSON seguindo o esquema fornecido.
    A pontuação (overallScore) deve ser rigorosa (0-100).

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

    console.log("Enviando requisição backend para DeepSeek API...");
    
    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
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
        max_tokens: 4096,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Erro DeepSeek Backend:", errorData);
      
      let errorMsg = "Erro desconhecido";
      if (response.status === 401) {
        errorMsg = "Chave da API inválida.";
      } else if (response.status === 429) {
        errorMsg = "Limite de requisições excedido.";
      } else if (response.status === 402) {
        errorMsg = "Saldo insuficiente no DeepSeek.";
      } else {
        errorMsg = errorData.error?.message || 'Falha na IA';
      }
      return res.status(response.status).json({ error: errorMsg });
    }

    const data = await response.json();
    const resultText = data.choices[0]?.message?.content;
    
    if (!resultText) {
      return res.status(500).json({ error: "Resposta vazia da IA" });
    }

    // Limpa marcações markdown de JSON caso a IA inclua
    let cleanText = resultText.trim();
    cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) cleanText = jsonMatch[0];
    
    const result = JSON.parse(cleanText);
    
    // Normalizar retorno
    const parsedData = {
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

    return res.status(200).json(parsedData);

  } catch (error: any) {
    console.error("Erro Interno Backend:", error);
    return res.status(500).json({ error: error.message || "Erro desconhecido no servidor." });
  }
}