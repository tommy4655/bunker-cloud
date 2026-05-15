export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { message } = req.body;
    const apiKey = process.env.OPENROUTER_API_KEY; 

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "model": "meta-llama/llama-3-8b-instruct:free", 
                "messages": [
                    {"role": "system", "content": "Eres la IA central de un búnker cyberpunk táctico. Responde de forma fría, concisa, realista y usando jerga informática."},
                    {"role": "user", "content": message}
                ]
            })
        });

        const data = await response.json();
        const reply = data.choices[0].message.content;
        return res.status(200).json({ reply });
    } catch (error) {
        return res.status(500).json({ error: "Fallo en la conexión con la IA central." });
    }
}
