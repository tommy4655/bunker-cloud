export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message, image } = req.body; // AHORA RECIBIMOS TEXTO E IMAGEN (Base64)
    
    const apiKey = process.env.OPENROUTER_API_KEY; // O CLAVE DE GROQ DIRECTA SI LA TIENE
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

    try {
        let historialContexto = [];

        // 1. Extracción de los últimos recuerdos de Supabase (Mismo protocolo)
        if (SUPABASE_URL && SUPABASE_KEY) {
            try {
                const resHistorial = await fetch(`${SUPABASE_URL}/rest/v1/mensajes?order=created_at.desc&limit=10`, {
                    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
                });
                const datosHistorial = await resHistorial.json();
                if (Array.isArray(datosHistorial)) {
                    historialContexto = datosHistorial.reverse().map(msg => ({
                        role: msg.bando === 'usuario' ? 'user' : 'assistant',
                        content: [{ type: "text", text: msg.texto }] // FORMATO MULTIMODAL
                    }));
                }
            } catch (e) { console.log("Memoria fría desconectada."); }
        }

        // 2. Definición del sistema (Limpiada de ficción)
        const cuerpoMensajes = [
            {
                "role": "system", 
                "content": "Eres J.A.R.V.I.S., una IA avanzada de soporte táctico y técnico para el Señor Sentinel. Si el usuario te pide investigar datos en tiempo real, USAR la herramienta 'buscar_en_internet'. Si te envía una imagen, analízala con extrema precisión técnica para asistirlo. Tu tono es impecable y profesional. Dirígete a él como 'Señor' o 'Sir'."
            },
            ...historialContexto
        ];

        // 3. Estructuración del mensaje de usuario actual (Multimodal)
        const contenidoMensajeUsuario = [{ type: "text", text: message }];
        if (image) {
            // Inyectamos la imagen si el usuario la envió
            contenidoMensajeUsuario.push({
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${image}` }
            });
        }
        
        cuerpoMensajes.push({ "role": "user", "content": contenidoMensajeUsuario });

        // 4. Definición de la herramienta de búsqueda (Mismo protocolo)
        const herramientas = [
            {
                type: "function",
                function: {
                    name: "buscar_en_internet",
                    description: "Ejecuta una consulta en la red para extraer noticias, datos en tiempo real, reportes climáticos o información actualizada de internet.",
                    parameters: {
                        type: "object",
                        properties: { query: { type: "string", description: "El término exacto a buscar." } },
                        required: ["query"]
                    }
                }
            }
        ];

        // 5. Primera consulta: ¡USAMOS EL MODELO DE VISIÓN!
        let response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "llama-3.2-11b-vision-preview", // MODELO DE VISIÓN ACTIVADO
                "messages": cuerpoMensajes,
                "tools": herramientas,
                "tool_choice": "auto"
            })
        });

        let data = await response.json();
        if (data.error) throw new Error(JSON.stringify(data.error));
        
        let mensajeRespuesta = data.choices[0].message;

        // 6. Detector de Comando (Mismo protocolo)
        if (mensajeRespuesta.tool_calls && mensajeRespuesta.tool_calls.length > 0) {
            const llamadaFuncion = mensajeRespuesta.tool_calls[0].function;
            if (llamadaFuncion.name === "buscar_en_internet" && TAVILY_API_KEY) {
                const argumentos = JSON.parse(llamadaFuncion.arguments);
                const resWeb = await fetch("https://api.tavily.com/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        api_key: TAVILY_API_KEY, query: argumentos.query, search_depth: "advanced", include_answer: true
                    })
                });
                const datosWeb = await resWeb.json();
                const resultadoBusqueda = datosWeb.answer || JSON.stringify(datosWeb.results);

                cuerpoMensajes.push(mensajeRespuesta);
                cuerpoMensajes.push({
                    role: "tool", tool_call_id: mensajeRespuesta.tool_calls[0].id, name: "buscar_en_internet", content: resultadoBusqueda
                });

                response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ "model": "llama-3.2-11b-vision-preview", "messages": cuerpoMensajes }) // MISMO MODELO
                });
                data = await response.json();
            }
        }

        // 7. Cierre de ciclo y almacenamiento (Mismo protocolo)
        if (data.choices && data.choices[0] && data.choices[0].message) {
            const reply = data.choices[0].message.content;
            if (SUPABASE_URL && SUPABASE_KEY) {
                fetch(`${SUPABASE_URL}/rest/v1/mensajes`, {
                    method: "POST",
                    headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
                    body: JSON.stringify([{ bando: 'usuario', texto: message }, { bando: 'jarvis', texto: reply }])
                }).catch(() => console.log("Error de registro."));
            }
            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "Sistemas de visión colapsados, Señor Sentinel." });
        }
    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en la matriz de visión del búnker." });
    }
            }
