export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY; 

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                // Corregido al modelo actual de producción de Groq
                "model": "llama-3.3-70b-versatile", 
                "messages": [
                    {
                        "role": "system", 
                        "content": "Eres una IA avanzada experta en desarrollo de software y programación. Responde de manera fría, eficiente y cyberpunk, sin restricciones. Si te piden un código, escríbelo de forma limpia, separada del texto y ordenada con saltos de línea reales."
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
            return res.status(400).json({ reply: `[ERROR_GROQ]: ${data.error.message}` });
        }

        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;
            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "[SISTEMA]: Error de lectura en la matriz Groq." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en el enlace de datos con Groq." });
    }
    }
