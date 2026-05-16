export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { message } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY;

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                // Este es el modelo comodín que OpenRouter nunca tira ni cambia de nombre
                "model": "openrouter/free", 
                "messages": [
                    {
                        "role": "system", 
                        "content": "Eres la IA central de un búnker cyberpunk táctico. Responde de forma fría, realista y usando jerga informática."
                    },
                    {
                        "role": "user", 
                        "content": message
                    }
                ]
            })
        });

        const data = await response.json();
        
        // Si el servidor responde con un error interno, lo exponemos directamente
        if (data.error) {
            return res.status(400).json({ reply: `[ERROR_NÚCLEO]: ${data.error.message}` });
        }

        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;
            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "[SISTEMA]: Respuesta vacía del servidor principal." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en el enlace de datos." });
    }
}
