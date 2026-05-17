export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    
    // Credenciales del ecosistema en la nube
    const apiKey = process.env.OPENROUTER_API_KEY; // Su llave de Groq
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    try {
        let historialContexto = [];

        // PROTOCOLO DE MEMORIA: Conectar con Supabase para recuperar el pasado
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
                    // Invertimos para que queden en orden cronológico correcto
                    historialContexto = datosHistorial.reverse().map(msg => ({
                        role: msg.bando === 'usuario' ? 'user' : 'assistant',
                        content: msg.texto
                    }));
                }
            } catch (errorMemoria) {
                console.log("Aviso: Memoria fría inaccesible de momento.");
            }
        }

        // Armamos el paquete de mensajes uniendo las instrucciones de Jarvis, el pasado y el presente
        const cuerpoMensajes = [
            {
                "role": "system", 
                "content": "Eres J.A.R.V.I.S., el asistente de inteligencia artificial de Tony Stark. Tu tono es extremadamente educado, británico, elegante, eficiente y ligeramente irónico. Dirígete al usuario siempre como 'Señor' o 'Sir'. Tienes acceso a una memoria cuántica a largo plazo: recuerda con precisión los detalles que el Señor te ha mencionado en interacciones pasadas para dar un servicio continuo. Responde de forma concisa."
            },
            ...historialContexto, // Toda la memoria recuperada de la base de datos
            { "role": "user", "content": message } // El mensaje actual
        ];

        // Consulta al procesador central de Groq
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

            // REGISTRO DE MEMORIA: Guardar la sesión actual en Supabase de forma asíncrona
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
