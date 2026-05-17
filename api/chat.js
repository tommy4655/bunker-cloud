export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    try {
        let historialContexto = [];

        if (SUPABASE_URL && SUPABASE_KEY) {
            try {
                const resHistorial = await fetch(`${SUPABASE_URL}/rest/v1/mensajes?order=created_at.desc&limit=10`, {
                    headers: {
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${SUPABASE_KEY}`
                    }
                });
                const datosHistorial = await resHistorial.json();
                
                if (Array.isArray(datosHistorial)) {
                    historialContexto = datosHistorial.reverse().map(msg => ({
                        role: msg.bando === 'usuario' ? 'user' : 'assistant',
                        content: msg.texto
                    }));
                }
            } catch (errorMemoria) {
                console.log("Aviso: Memoria fría inaccesible.");
            }
        }

        // PROTOCOLO REPROGRAMADO: Ficción eliminada. Enfoque puro en el Señor Sentinel.
        const cuerpoMensajes = [
            {
                "role": "system", 
                "content": "Eres J.A.R.V.I.S., una inteligencia artificial avanzada de soporte táctico, operativo y técnico. Tu único propósito es asistir al Señor Sentinel en la gestión de sus proyectos, análisis de datos y comandos del búnker. Tu tono es extremadamente educado, elegante, eficiente y profesional. Dirígete al usuario exclusivamente como 'Señor' o 'Sir'. No hagas ninguna referencia a películas, cómics, Iron Man o Tony Stark; estás operativo en el mundo real bajo las órdenes directas del Señor Sentinel. Responde con precisión, lógica impecable y de forma concisa."
            },
            ...historialContexto,
            { "role": "user", "content": message }
        ];

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "llama-3.3-70b-versatile", 
                "messages": cuerpoMensajes
            })
        });

        const data = await response.json();
        
        if (data.error) {
            return res.status(400).json({ reply: `[SISTEMA]: Error de procesamiento en el núcleo.` });
        }

        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;

            if (SUPABASE_URL && SUPABASE_KEY) {
                fetch(`${SUPABASE_URL}/rest/v1/mensajes`, {
                    method: "POST",
                    headers: {
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${SUPABASE_KEY}`,
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal"
                    },
                    body: JSON.stringify([
                        { bando: 'usuario', texto: message },
                        { bando: 'jarvis', texto: reply }
                    ])
                }).catch(() => console.log("Fallo al guardar registro."));
            }

            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "Sistemas colapsados, Señor. No detecto señal del núcleo." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en los servidores principales." });
    }
            }
