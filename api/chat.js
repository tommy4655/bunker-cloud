export default async function handler(req, res) {
    // Asegurar que solo acepte peticiones POST de tu web
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY; 

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                // Estas dos líneas le avisan a OpenRouter que es una conexión legítima de Vercel
                "HTTP-Referer": "https://vercel.com", 
                "X-Title": "Bunker Cyberpunk"
            },
            body: JSON.stringify({
                // Cambiamos al motor gratuito más rápido y estable disponible
                "model": "google/gemini-2.5-flash:free", 
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

        // Capturar la respuesta del servidor
        const data = await response.json();
        
        // Si OpenRouter devuelve un error interno, lo leemos aquí
        if (data.error) {
            return res.status(400).json({ reply: `[ERROR_NÚCLEO]: ${data.error.message}` });
        }

        const reply = data.choices[0].message.content;
        return res.status(200).json({ reply });

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en el enlace de datos." });
    }
}
