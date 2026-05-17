export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Comando vacío' });
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    try {
        let historialContexto = [];

        // 1. MEMORIA DE TRABAJO (Opción B) - Extracción con filtro estricto anti-errores
        if (SUPABASE_URL && SUPABASE_KEY) {
            try {
                const resHistorial = await fetch(`${SUPABASE_URL}/rest/v1/mensajes?order=created_at.desc&limit=10`, {
                    headers: {
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${SUPABASE_KEY}`
                    }
                });
                
                if (resHistorial.ok) {
                    const datosHistorial = await resHistorial.json();
                    
                    if (Array.isArray(datosHistorial)) {
                        // Invertimos el orden y filtramos que tengan bando y texto válidos
                        historialContexto = datosHistorial.reverse()
                            .filter(msg => msg && msg.bando && msg.texto)
                            .map(msg => ({
                                role: msg.bando === 'usuario' ? 'user' : 'assistant',
                                content: String(msg.texto).trim()
                            }));
                    }
                }
            } catch (e) { 
                console.log("Filtro de contingencia: Saltando historial dañado.");
                historialContexto = []; 
            }
        }

        // 2. CONSTRUCCIÓN DE LA SINTAXIS NATIVA DE MENSAJES
        const cuerpoMensajes = [
            {
                "role": "system", 
                "content": "Eres J.A.R.V.I.S., una inteligencia artificial avanzada asignada al búnker operativo del Señor Sentinel. Tu tono es impecable, elegante y conciso. Dirígete a él como 'Señor' o 'Sir'. Si te pide investigar o buscar información en tiempo real, usa la función 'buscar_en_internet'."
            },
            ...historialContexto,
            { "role": "user", "content": String(message).trim() }
        ];

        // 3. DECLARACIÓN DE HERRAMIENTAS DE NAVEGACIÓN
        const herramientas = [
            {
                type: "function",
                function: {
                    name: "buscar_en_internet",
                    description: "Ejecuta búsquedas web en tiempo real para obtener noticias, clima o datos actuales.",
                    parameters: {
                        type: "object",
                        properties: { query: { type: "string", description: "Término de búsqueda." } },
                        required: ["query"]
                    }
                }
            }
        ];

        // 4. CONSULTA EVALUATIVA A GROQ
        let response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${apiKey}`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({
                "model": "llama-3.3-70b-versatile", 
                "messages": cuerpoMensajes,
                "tools": herramientas,
                "tool_choice": "auto"
            })
        });

        if (!response.ok) {
            // Plan de respaldo si Groq rechaza el historial: Intentar la petición limpia solo con el mensaje actual
            response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    "model": "llama-3.3-70b-versatile", 
                    "messages": [
                        { "role": "system", "content": "Eres J.A.R.V.I.S., asistente del Señor Sentinel." },
                        { "role": "user", "content": String(message).trim() }
                    ]
                })
            });
        }

        let data = await response.json();
        let mensajeRespuesta = data.choices?.[0]?.message;

        if (!mensajeRespuesta) {
            return res.status(200).json({ reply: "Sistemas en mantenimiento, Sir. Intente enviar el comando nuevamente." });
        }

        // 5. CONTROL INTERNO DE NAVEGACIÓN (Tavily)
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
                const resultadoBusqueda = datosWeb.results ? datosWeb.results.map(r => r.content).join(" ") : "Sin resultados.";

                cuerpoMensajes.push(mensajeRespuesta);
                cuerpoMensajes.push({
                    role: "tool",
                    tool_call_id: mensajeRespuesta.tool_calls[0].id,
                    name: "buscar_en_internet",
                    content: resultadoBusqueda.substring(0, 1200)
                });

                response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ "model": "llama-3.3-70b-versatile", "messages": cuerpoMensajes })
                });
                data = await response.json();
            }
        }

        // 6. PERSISTENCIA AUTOMÁTICA EN SUPABASE Y RESPUESTA FINAL
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
                }).catch(() => console.log("Omitiendo registro de Supabase."));
            }

            return res.status(200).json({ reply });
        } else {
            return res.status(200).json({ reply: "Matriz reiniciada de manera segura. ¿Cuáles son sus directivas, Señor?" });
        }

    } catch (error) {
        console.error(error);
        return res.status(200).json({ reply: "Enlace reestablecido. El núcleo está listo para operar, Señor Sentinel." });
    }
    }
