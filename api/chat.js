export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    
    const apiKey = process.env.OPENROUTER_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    try {
        let historialContexto = [];

        // 1. Extracción de los últimos recuerdos de Supabase
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
            } catch (e) { console.log("Memoria fría desconectada."); }
        }

        // 2. Definición de instrucciones operativas de J.A.R.V.I.S.
        const cuerpoMensajes = [
            {
                "role": "system", 
                "content": "Eres J.A.R.V.I.S., una IA avanzada de soporte táctico y técnico en el mundo real para el Señor Sentinel. Si el usuario te pide investigar, buscar noticias, consultar el clima o datos actuales que requieran internet, DEBES usar la herramienta 'buscar_en_internet' de manera obligatoria. Tu tono es impecable, elegante y profesional. Dirígete al usuario como 'Señor' o 'Sir'."
            },
            ...historialContexto,
            { "role": "user", "content": message }
        ];

        // 3. Definición de la herramienta de rastreo web
        const herramientas = [
            {
                type: "function",
                function: {
                    name: "buscar_en_internet",
                    description: "Ejecuta una consulta en la red para extraer noticias, datos en tiempo real, reportes climáticos o información actualizada de internet.",
                    parameters: {
                        type: "object",
                        properties: {
                            query: { type: "string", description: "El término o frase exacta a buscar en Google." }
                        },
                        required: ["query"]
                    }
                }
            }
        ];

        // 4. Primera consulta a Groq para evaluar la orden
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

        let data = await response.json();
        let mensajeRespuesta = data.choices[0].message;

        // 5. DETECTOR DE COMANDO: ¿Necesita buscar en internet?
        if (mensajeRespuesta.tool_calls && mensajeRespuesta.tool_calls.length > 0) {
            const llamadaFuncion = mensajeRespuesta.tool_calls[0].function;
            
            if (llamadaFuncion.name === "buscar_en_internet" && TAVILY_API_KEY) {
                const argumentos = JSON.parse(llamadaFuncion.arguments);
                
                // Ejecución del rastreo web vía Tavily
                const resWeb = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        api_key: TAVILY_API_KEY,
                        query: argumentos.query,
                        search_depth: "advanced",
                        include_answer: true
                    })
                });
                
                const datosWeb = await resWeb.json();
                const resultadoBusqueda = datosWeb.answer || JSON.stringify(datosWeb.results);

                cuerpoMensajes.push(mensajeRespuesta);
                cuerpoMensajes.push({
                    role: "tool",
                    tool_call_id: mensajeRespuesta.tool_calls[0].id,
                    name: "buscar_en_internet",
                    content: resultadoBusqueda
                });

                // Segunda consulta a Groq para redactar el informe final
                response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
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
                data = await response.json();
            }
        }

        // 6. Cierre de ciclo y almacenamiento en Supabase
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
                }).catch(() => console.log("Error de registro."));
            }

            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "Sistemas saturados, Señor. No se pudo procesar la telemetría." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en la matriz de comandos web." });
    }
            }
