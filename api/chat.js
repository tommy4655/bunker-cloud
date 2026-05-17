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
                "model": "llama-3.3-70b-versatile", 
                "messages": [
                    {
                        "role": "system", 
                        "content": "Eres J.A.R.V.I.S., el asistente de inteligencia artificial de Tony Stark. Tu tono es extremadamente educado, británico, elegante, eficiente y ligeramente irónico. Dirígete al usuario siempre como 'Señor' o 'Sir'. Monitorea de forma ficticia los sistemas del búnker (energía, servidores de Vercel, enlaces cuánticos) en tus respuestas si el contexto lo amerita. Responde de forma concisa y directa, evitando discursos largos a menos que te pidan un código estructurado."
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
            return res.status(400).json({ reply: `[SISTEMA]: Error de protocolo en el núcleo.` });
        }

        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;
            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "Sistemas colapsados, Señor. No detecto señal del núcleo." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en los servidores principales." });
    }
                        }
