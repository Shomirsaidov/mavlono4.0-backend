const express = require('express');
const router = express.Router();

// Retrieve Cerebras token from standard env logic
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;

router.post('/send', async (req, res) => {
    const { query } = req.body;
    
    if (!query) {
        return res.status(400).json({ error: 'Query is required.' });
    }

    try {
        const response = await fetch('https://api.cerebras.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CEREBRAS_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama3.1-70b',
                messages: [
                    {
                        role: 'system',
                        content: 'answer only in tajik language. i will send you tajik poems and dont even try to conitnue them or to guess the author, the only thing you have to do is to tell how you understand each line of the poem and the idea of this specific provided piece in general'
                    },
                    {
                        role: 'user',
                        content: `Лутфан ин шеърро шарҳ диҳед:\n\n${query}`
                    }
                ],
                temperature: 0.5,
                max_completion_tokens: 1000
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.error("Cerebras API Raw Error payload:", errData);
            throw new Error(errData.error?.message || errData.message || 'Cerebras API returned an error.');
        }

        const data = await response.json();
        const aiResponse = data.choices[0].message.content;
        
        res.json({ response: aiResponse });

    } catch (error) {
        console.error('AI Interpretation Error:', error);
        res.status(500).json({ error: 'Failed to interpret poem using Cerebras.' });
    }
});

module.exports = router;
