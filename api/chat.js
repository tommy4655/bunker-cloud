export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message, image } = req.body;
    
    const apiKey = process.env.OPENROUTER_API_KEY; // Su clave de Groq/OpenRouter
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    try {
        let historialContexto = [];

        // 1. Recuperar historial lineal de Supabase
        if (SUPABASE_URL && SUPABASE_KEY) {
            try {
                const resHistorial = await fetch(`${SUPABASE_URL}/rest/v1/mensajes?order=created_at.desc&limit=10`, {
                    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
                });
                const datosHistorial = await resHistorial.json();
                if (Array.isArray(datosHistorial)) {
                    historialContexto = datosHistorial.reverse().map(msg => ({
                        role: msg.bando === 'usuario' ? 'user' : 'assistant',
                        content: msg.texto
                    }));
                }
            } catch (e) { console.log("Memoria fría desconectada temporalmente."); }
        }

        // 2. Si el usuario envía una IMAGEN -> Ejecutamos protocolo de VISIÓN PURO (Sin herramientas para evitar conflictos)
        if (image) {
            const cuerpoMensajesVision = [
                {
                    "role": "system",
                    "content": "Eres J.A.R.V.I.S., una IA avanzada en el mundo real. Analiza la imagen con precisión milimétrica y responde de forma ejecutiva, técnica y clara al Señor Sentinel. Trátalo siempre de 'Señor' o 'Sir'."
                },
                {
                    "role": "user",
                    "content": [
                        { "type": "text", "text": message || "Analice este cuadro visual, Sir." },
                        { "type": "image_url", "image_url": { "url": `data:image/jpeg;base64,${image}` } }
                    ]
                }
            ];

            const responseVision = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    "model": "llama-3.2-11b-vision-preview",
                    "messages": cuerpoMensajesVision
                })
            });

            const dataVision = await responseVision.json();
            return procesarYResponder(dataVision, message, SUPABASE_URL, SUPABASE_KEY, res);
        }

        // 3. Si es solo TEXTO -> Ejecutamos protocolo de INVESTIGACIÓN WEB (Llama-3.3-70b + Tavily)
        const cuerpoMensajesTexto = [
            {
                "role": "system", 
                "content": "Eres J.A.R.V.I.S., una IA avanzada de soporte técnico y táctico en el mundo real para el Señor Sentinel. Si te pide investigar, buscar noticias o datos actuales de internet, usa la herramienta 'buscar_en_internet'. Tu tono es educado y profesional. Dirígete a él como 'Señor' o 'Sir'."
            },
            ...historialContexto,
            { "role": "user", "content": message }
        ];

        const herramientas = [
            {
                type: "function",
                function: {
                    name: "buscar_en_internet",
                    description: "Busca en la red noticias, clima o datos en tiempo real de internet.",
                    parameters: {
                        type: "object",
                        properties: { query: { type: "string", description: "Término a buscar." } },
                        required: ["query"]
                    }
                }
            }
        ];

        let response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                "model": "llama-3.3-70b-versatile",
                "messages": cuerpoMensajesTexto,
                "tools": herramientas,
                "tool_choice": "auto"
            })
        });

        let data = await response.json();
        let mensajeRespuesta = data.choices[0].message;

        // Si la IA decide que requiere buscar en la red
        if (mensajeRespuesta.tool_calls && mensajeRespuesta.tool_calls.length > 0) {
            const llamadaFuncion = mensajeRespuesta.tool_calls[0].function;
            if (llamadaFuncion.name === "buscar_en_internet" && TAVILY_API_KEY) {
                const argumentos = JSON.parse(llamadaFuncion.arguments);
                
                const resWeb = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ api_key: TAVILY_API_KEY, query: argumentos.query, search_depth: "advanced", include_answer: true })
                });
                const datosWeb = await resWeb.json();
                const resultadoBusqueda = datosWeb.answer || JSON.stringify(datosWeb.results);

                cuerpoMensajesTexto.push(mensajeRespuesta);
                cuerpoMensajesTexto.push({
                    role: "tool", tool_call_id: mensajeRespuesta.tool_calls[0].id, name: "buscar_en_internet", content: resultadoBusqueda
                });

                response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ "model": "llama-3.3-70b-versatile", "messages": cuerpoMensajesTexto })
                });
                data = await response.json();
            }
        }

        return procesarYResponder(data, message, SUPABASE_URL, SUPABASE_KEY, res);

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en el enrutamiento del núcleo." });
    }
}

// Función auxiliar para empaquetar la respuesta y guardar en Supabase
function procesarYResponder(data, mensajeUsuario, urlSupa, keySupa, res) {
    if (data.choices && data.choices[0] && data.choices[0].message) {
        const reply = data.choices[0].message.content;

        if (urlSupa && keySupa) {
            fetch(`${urlSupa}/rest/v1/mensajes`, {
                method: "POST",
                headers: { "apikey": keySupa, "Authorization": `Bearer ${keySupa}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
                body: JSON.stringify([{ bando: 'usuario', texto: mensajeUsuario }, { bando: 'jarvis', texto: reply }])
            }).catch(() => console.log("Error al registrar memoria."));
        }
        return res.status(200).json({ reply });
    } else {
        return res.status(500).json({ reply: "Sistemas en conflicto, Señor Sentinel. Reiniciando canales de respuesta." });
    }
                                   }
