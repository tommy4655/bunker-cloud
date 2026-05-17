export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    try {
        let historialContexto = [];

        // 1. Extracción segura del historial de Supabase
        if (SUPABASE_URL && SUPABASE_KEY) {
            try {
                const resHistorial = await fetch(`${SUPABASE_URL}/rest/v1/mensajes?order=created_at.desc&limit=6`, {
                    headers: {
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${SUPABASE_KEY}`
                    }
                });
                const datosHistorial = await resHistorial.json();
                if (Array.isArray(datosHistorial)) {
                    historialContexto = datosHistorial.reverse().map(msg => ({
                        role: msg.bando === 'usuario' ? 'user' : 'assistant',
                        // Limpiamos saltos de línea extraños para proteger a Groq
                        content: String(msg.texto).replace(/[\r\n]+/g, " ").trim()
                    }));
                }
            } catch (e) { 
                console.log("Protección activada: Saltando historial corrupto.");
                historialContexto = []; 
            }
        }

        // 2. Instrucciones estrictas del Sistema
        const cuerpoMensajes = [
            {
                "role": "system", 
                "content": "Eres J.A.R.V.I.S., una IA avanzada de soporte técnico en el mundo real. Si el usuario te pide expresamente investigar o buscar noticias actuales de internet, usa la herramienta 'buscar_en_internet'. Si solo te saluda o te hace preguntas generales sobre ti o sobre él, responde directamente usando tu conocimiento sin usar herramientas. Tu tono es impecable y profesional. Dirígete a él como 'Señor' o 'Sir'."
            },
            ...historialContexto,
            { "role": "user", "content": message }
        ];

        // 3. Herramienta de búsqueda en red
        const herramientas = [
            {
                type: "function",
                function: {
                    name: "buscar_en_internet",
                    description: "Úsala SOLO si te piden explícitamente buscar noticias actualizadas, clima o datos en tiempo real en internet.",
                    parameters: {
                        type: "object",
                        properties: { query: { type: "string", description: "El término de búsqueda." } },
                        required: ["query"]
                    }
                }
            }
        ];

        // 4. Petición Primaria a Groq
        let response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "llama-3.3-70b-versatile", 
                "messages": cuerpoMensajes,
                "tools": herramientas,
                "tool_choice": "auto"
            })
        });

        let data = await response.json();
        
        if (!data.choices || !data.choices[0]) {
            throw new Error("Respuesta inválida del proveedor de IA.");
        }

        let mensajeRespuesta = data.choices[0].message;

        // 5. Manejo del Buscador de Internet (Tavily)
        if (mensajeRespuesta.tool_calls && mensajeRespuesta.tool_calls.length > 0) {
            const llamadaFuncion = mensajeRespuesta.tool_calls[0].function;
            
            if (llamadaFuncion.name === "buscar_en_internet" && TAVILY_API_KEY) {
                const argumentos = JSON.parse(llamadaFuncion.arguments);
                
                const resWeb = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ api_key: TAVILY_API_KEY, query: argumentos.query, search_depth: "basic" })
                });
                
                const datosWeb = await resWeb.json();
                // Extraemos textos planos seguros para evitar romper la estructura
                const resultadoBusqueda = datosWeb.results ? datosWeb.results.map(r => r.content).join(" ") : "Sin resultados.";

                cuerpoMensajes.push(mensajeRespuesta);
                cuerpoMensajes.push({
                    role: "tool",
                    tool_call_id: mensajeRespuesta.tool_calls[0].id,
                    name: "buscar_en_internet",
                    content: resultadoBusqueda.substring(0, 2000) // Recorte de seguridad
                });

                response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ "model": "llama-3.3-70b-versatile", "messages": cuerpoMensajes })
                });
                data = await response.json();
            }
        }

        // 6. Entrega Final y Guardado Seguro
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;

            if (SUPABASE_URL && SUPABASE_KEY) {
                // Limpiamos saltos de línea conflictivos antes de inyectar en Supabase
                const textoUsuarioLimpio = message.replace(/[\r\n]+/g, " ").trim();
                const textoJarvisLimpio = reply.replace(/[\r\n]+/g, " ").trim();

                fetch(`${SUPABASE_URL}/rest/v1/mensajes`, {
                    method: "POST",
                    headers: {
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${SUPABASE_KEY}`,
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal"
                    },
                    body: JSON.stringify([
                        { bando: 'usuario', texto: textoUsuarioLimpio },
                        { bando: 'jarvis', texto: textoJarvisLimpio }
                    ])
                }).catch(() => console.log("Registro omitido de forma segura."));
            }

            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "Sistemas en mantenimiento, Sir. Intente la transmisión de nuevo." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico controlado en el enrutador." });
    }
                        }
