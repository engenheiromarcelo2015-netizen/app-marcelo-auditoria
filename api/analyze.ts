import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { files, modes } = req.body;

    const apiKey = process.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "API Key não configurada" });
    }

    const focusDescriptions = modes.map((mode: string) => {
      if (mode === "IATF") return "IATF 16949";
      if (mode === "ISO 14001") return "ISO 14001";
      return "ISO 9001 + E1";
    }).join(", ");

    const combinedText = files.map((f: any) => {
      const texto = f.text?.slice(0, 6000) || "";
      return `DOCUMENTO: ${f.name}\n${texto}`;
    }).join("\n\n---\n\n");

    const prompt = `
Analise os documentos com base em: ${focusDescriptions}

Responda SOMENTE JSON válido.

DOCUMENTOS:
${combinedText}
`;

    const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "Responda apenas JSON válido." },
          { role: "user", content: prompt }
        ],
        temperature: 0.2
      })
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "{}";

    return res.status(200).json(JSON.parse(text));

  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
}