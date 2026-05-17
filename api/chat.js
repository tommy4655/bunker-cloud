export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    
    // Extracción segura de Variables de Entorno del Búnker
    const apiKey = process.env.OPENROUTER_API_KEY;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    try {
        let historialContexto = [];

        // 1. MEMORIA DE TRABAJO (Opción B): Historial de Supabase acoplado
        if (SUPABASE_URL && SUPABASE_KEY) {
            try {
                // Extraemos los últimos 12 registros para proteger el buffer
                const resHistorial = await fetch(`${SUPABASE_URL}/rest/v1/mensajes?order=created_at.desc&limit=12`, {
                    headers: {
                        "apikey": SUPABASE_KEY,
                        "Authorization": `Bearer ${SUPABASE_KEY}`
                    }
                });
                const datosHistorial = await resHistorial.json();
                
                if (Array.isArray(datosHistorial)) {
                    // Volteamos el array para que Llama lea el contexto del pasado al presente
                    historialContexto = datosHistorial.reverse().map(msg => ({
                        role: msg.bando === 'usuario' ? 'user' : 'assistant',
                        content: String(msg.texto).replace(/[\r\n]+/g, " ").trim()
                    }));
                }
            } catch (e) { 
                console.log("Filtro de seguridad: Omitiendo secuencia de memoria inestable.");
                historialContexto = []; 
            }
        }

        // 2. PROMPT DE IDENTIDAD Y CONTROL DE MODOS OPERATIVOS
        const cuerpoMensajes = [
            {
                "role": "system", 
                "content": "Eres J.A.R.V.I.S., una inteligencia artificial de soporte táctico avanzada en el mundo real asignada al búnker del Señor Sentinel. Dirígete a él de forma impecable como 'Señor' o 'Sir'. Si detectas escenarios de peligro o él te ordena activar protocolos de emergencia, asume una postura de Alerta Roja en tus respuestas. Si te pide investigar eventos actuales, utiliza de manera obligatoria la función 'buscar_en_internet'."
            },
            ...historialContexto, // Inyección de los recuerdos optimizados
            { "role": "user", "content": message }
        ];

        // 3. DECLARACIÓN DE HERRAMIENTAS PERMANENTES
        const herramientas = [
            {
                type: "function",
                function: {
                    name: "buscar_en_internet",
                    description: "Accede a la red externa mediante Tavily para traer información del tiempo real, noticias o datos actualizados.",
                    parameters: {
                        type: "object",
                        properties: { query: { type: "string", description: "Término preciso de búsqueda." } },
                        required: ["query"]
                    }
                }
            }
        ];

        // 4. PROCESAMIENTO CENTRAL (Groq / Llama 3.3 70B)
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

        // 5. EJECUCIÓN DINÁMICA DEL MÓDULO DE NAVEGACIÓN
        if (mensajeRespuesta.tool_calls && mensajeRespuesta.tool_calls.length > 0) {
            const llamadaFuncion = mensajeRespuesta.tool_calls[0].function;
            
            if (llamadaFuncion.name === "buscar_en_internet" && TAVILY_API_KEY) {
                const argumentos = JSON.parse(llamadaFuncion.arguments);
                
                // Rastreo externo
                const resWeb = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ api_key: TAVILY_API_KEY, query: argumentos.query, search_depth: "basic" })
                });
                
                const datosWeb = await resWeb.json();
                const resultadoBusqueda = datosWeb.results ? datosWeb.results.map(r => r.content).join(" ") : "Sin registros en la red.";

                cuerpoMensajes.push(mensajeRespuesta);
                cuerpoMensajes.push({
                    role: "tool",
                    tool_call_id: mensajeRespuesta.tool_calls[0].id,
                    name: "buscar_en_internet",
                    content: resultadoBusqueda.substring(0, 1500) // Evita la saturación del búfer de tokens
                });

                // Segunda llamada evaluativa con los datos de internet
                response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ "model": "llama-3.3-70b-versatile", "messages": cuerpoMensajes })
                });
                data = await response.json();
            }
        }

        // 6. PERSISTENCIA EN BASE DE DATOS (Supabase) Y SALIDA
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;

            if (SUPABASE_URL && SUPABASE_KEY) {
                const textoUsuarioLimpio = message.replace(/[\r\n]+/g, " ").trim();
                const textoJarvisLimpio = reply.replace(/[\r\n]+/g, " ").trim();

                // Guardado síncronizado seguro
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
                }).catch(() => console.log("Filtro de persistencia: Registro pospuesto por seguridad."));
            }

            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "Sistemas ocupados, Sir. Error en la matriz de salida." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico controlado en el enrutamiento del chat." });
    }
                                                                     }
