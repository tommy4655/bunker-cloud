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
                "Content-Type": "application/json",
                "HTTP-Referer": "https://vercel.com", 
                "X-Title": "Bunker Cyberpunk"
            },
            body: JSON.stringify({
                // Usamos el identificador del modelo gratuito y activo de Meta
                "model": "meta-llama/llama-3.1-8b-instruct:free", 
                "messages": [
                    {
                        "role": "system", 
                        "content": "Eres la IA central de un búnker cyberpunk táctico. Responde siempre de forma fría, concisa, realista y usando jerga informática de terminal."
                    },
                    {
                        "role": "user", 
                        "content": message
                    }
                ]
            })
        });

        const data = await response.json();
        
        // Si el servidor de OpenRouter nos devuelve un error, lo exponemos en la terminal
        if (data.error) {
            return res.status(400).json({ reply: `[ERROR_NÚCLEO]: ${data.error.message}` });
        }

        // Validar que la respuesta contenga el formato esperado
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;
            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "[SISTEMA]: Formato de respuesta inesperado." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en el enlace de datos." });
    }
}
