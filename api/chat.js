export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    try {
        let historialContexto = [];

        // 1. OPCIÓN B: Extracción optimizada del historial de Supabase (Límite controlado)
        if (SUPABASE_URL && SUPABASE_KEY) {
            try {
                // Traemos los últimos 12 mensajes (un buffer balanceado para evitar desbordamiento)
                const resHistorial = await fetch(`${SUPABASE_URL}/rest/v1/mensajes?order=created_at.desc&limit=12`, {
                    headers: {
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${SUPABASE_KEY}`
                    }
                });
                const datosHistorial = await resHistorial.json();
                
                if (Array.isArray(datosHistorial)) {
                    // Invertimos el orden para que Llama 3.3 entienda la línea de tiempo de más antiguo a más reciente
                    historialContexto = datosHistorial.reverse().map(msg => ({
                        // Emparejamiento exacto con sus columnas originales: 'bando' y 'texto'
                        role: msg.bando === 'usuario' ? 'user' : 'assistant',
                        content: String(msg.texto).replace(/[\r\n]+/g, " ").trim()
                    }));
                }
            } catch (e) { 
                console.log("Filtro de seguridad: Omitiendo bloque de memoria corrupto.");
                historialContexto = []; 
            }
        }

        // 2. Definición del Prompt de Sistema y Cuerpo de Mensajes
        const cuerpoMensajes = [
            {
                "role": "system", 
                "content": "Eres J.A.R.V.I.S., una IA avanzada de soporte táctico y técnico en el mundo real para el Señor Sentinel. Si el usuario te pide investigar, buscar noticias o datos actuales de internet, usa la herramienta 'buscar_en_internet'. Si son saludos o comandos internos, responde directamente con tu conocimiento. Tu tono es impecable, elegante y profesional. Dirígete a él como 'Señor' o 'Sir'."
            },
            ...historialContexto, // Inyección del historial cronológico optimizado
            { "role": "user", "content": message }
        ];

        // 3. Declaración de Herramientas de Navegación (Tavily)
        const herramientas = [
            {
                type: "function",
                function: {
                    name: "buscar_en_internet",
                    description: "Ejecuta una consulta en tiempo real para extraer noticias, datos actuales o reportes climáticos de la red.",
                    parameters: {
                        type: "object",
                        properties: { query: { type: "string", description: "El término exacto a buscar en internet." } },
                        required: ["query"]
                    }
                }
            }
        ];

        // 4. Primera consulta evaluativa a Groq
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
        let mensajeRespuesta = data.choices[0].message;

        // 5. Gestión del Módulo de Navegación Web en tiempo real
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
                const resultadoBusqueda = datosWeb.results ? datosWeb.results.map(r => r.content).join(" ") : "Sin resultados en la red.";

                cuerpoMensajes.push(mensajeRespuesta);
                cuerpoMensajes.push({
                    role: "tool",
                    tool_call_id: mensajeRespuesta.tool_calls[0].id,
                    name: "buscar_en_internet",
                    content: resultadoBusqueda.substring(0, 1500) // Recorte estricto para evitar saturación de tokens
                });

                // Segunda consulta para procesar el informe de internet
                response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ "model": "llama-3.3-70b-versatile", "messages": cuerpoMensajes })
                });
                data = await response.json();
            }
        }

        // 6. Registro Seguro de Datos y Respuesta Final
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;

            if (SUPABASE_URL && SUPABASE_KEY) {
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
                }).catch(() => console.log("Registro omitido preventivamente."));
            }

            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "Sistemas ocupados, Sir. Error en la matriz de salida." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico controlado en el enrutamiento del chat." });
    }
    }
