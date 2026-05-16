export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://vercel.com",
                "X-Title": "Bunker Pro"
            },
            body: JSON.stringify({
                "model": "meta-llama/llama-3-8b-instruct:free", 
                "messages": [
                    {
                        "role": "system", 
                        "content": "Eres una IA avanzada experta en programación y sistemas. Responde siempre de forma clara, estructurada, usando saltos de línea para el código y adoptando un tono de terminal cyberpunk frío pero altamente eficiente."
                    },
                    {
                        "role": "user", 
                        "content": message
                    }
                ]
            })
        });

        const data = await response.json();
        
        if (data.error) {
            return res.status(400).json({ reply: `[ERROR_NÚCLEO]: ${data.error.message}` });
        }

        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;
            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "[SISTEMA]: Error de lectura en el núcleo principal." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en el enlace de datos." });
    }
    }
