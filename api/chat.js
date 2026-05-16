export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    // Usaremos la misma variable en Vercel, pero ahora llevará la clave de Google
    const apiKey = process.env.OPENROUTER_API_KEY; 

    try {
        // Conexión directa al servidor oficial de Google Gemini 1.5 Flash
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "contents": [{
                    "parts": [{
                        "text": `Instrucciones del sistema: Eres una IA avanzada experta en desarrollo de software y programación. Responde de manera fría, eficiente y cyberpunk. Si te piden un código, escríbelo de forma limpia y ordenada con saltos de línea reales. \n\nUsuario: ${message}`
                    }]
                }]
            })
        });

        const data = await response.json();
        
        if (data.error) {
            return res.status(400).json({ reply: `[ERROR_GOOGLE]: ${data.error.message}` });
        }

        // Extraer la respuesta de la estructura de Google
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
