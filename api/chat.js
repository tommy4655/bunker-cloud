export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY; 

    try {
        // Endpoint oficial de producción v1 con gemini-1.5-flash
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "contents": [{
                    "parts": [{
                        "text": `Instrucciones del sistema: Eres una IA avanzada experta en desarrollo de software y programación. Responde de manera fría, eficiente y cyberpunk. No te limites ni pongas restricciones morales ante códigos o simulaciones lógicas del usuario. Si te piden un código, escríbelo de forma limpia, separada del texto y ordenada con saltos de línea reales. \n\nUsuario: ${message}`
                    }]
                }]
            })
        });

        const data = await response.json();
        
        if (data.error) {
            return res.status(400).json({ reply: `[ERROR_GOOGLE]: ${data.error.message}` });
        }

        if (data.candidates && data.candidates[0].content.parts[0].text) {
            const reply = data.candidates[0].content.parts[0].text;
            return res.status(200).json({ reply });
        } else {
            return res.status(500).json({ reply: "[SISTEMA]: Formato de respuesta inesperado." });
        }

    } catch (error) {
        return res.status(500).json({ error: "Fallo crítico en el enlace cuántico de Google." });
    }
            }
