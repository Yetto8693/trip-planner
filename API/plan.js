/**
 * Vercel Serverless Function: /api/plan
 * Handles AI Travel Plan generation using Gemini 3.8 Flash model.
 */

export default async function handler(req, res) {
    // Set CORS headers to allow requests from your frontend
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    try {
        const { destination, duration, companion, interests } = req.body;

        if (!destination) {
            return res.status(400).json({ error: '여행지가 입력되지 않았습니다.' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.' });
        }

        // Constructing the prompt with strict guidelines
        const prompt = `
You are an expert AI travel planner. Create a customized travel itinerary based on the user's input below.

[User Request]
- Destination: ${destination}
- Duration: ${duration}
- Companion: ${companion}
- Interests: ${Array.isArray(interests) ? interests.join(', ') : interests}

[Strict Rules & Constraints]
1. Re-check if the user input (especially destination or query) is related to travel or a valid trip destination. If it is completely unrelated to travel or inappropriate, return ONLY this exact JSON object: {"error": "여행과 관련된 내용만 입력해주세요."}
2. Do NOT state specific business operating hours, exact ticket prices, or fees definitively, as they fluctuate. Instead, phrase them generally or advise checking official channels before visiting (e.g., "방문 전 영업시간 및 요금 사전 확인 권장").
3. Divide the schedule by days (Day 1, Day 2, etc.), including specific times, titles, descriptions for activities, and a useful AI tip for each day.
4. Return ONLY a pure, valid JSON object following the exact structure below. Do not wrap it in markdown or add conversational filler:
{
  "destination": "${destination}",
  "duration": "${duration}",
  "companion": "${companion}",
  "interests": ${JSON.stringify(interests || [])},
  "title": "Attractive custom itinerary title in Korean",
  "days": [
    {
      "day": 1,
      "title": "Day 1 summary title",
      "activities": [
        { "time": "09:30", "title": "Activity name", "desc": "Detailed description of the activity." }
      ],
      "tip": "Useful tip for this day"
    }
  ]
}
`;

        // Call Gemini API using gemini-3.8-flash model
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    responseMimeType: "application/json"
                }
            })
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.text();
            throw new Error(`Gemini API 통신 실패: ${errorBody}`);
        }

        const data = await geminiResponse.json();
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResponse) {
            throw new Error('Gemini로부터 유효한 응답을 받지 못했습니다.');
        }

        let planData;
        try {
            // Clean markdown code blocks if present
            const cleanedText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
            planData = JSON.parse(cleanedText);
        } catch (parseError) {
            throw new Error('AI 응답을 JSON으로 파싱하는 중 오류가 발생했습니다.');
        }

        // If validation rule triggered an error response
        if (planData.error) {
            return res.status(400).json(planData);
        }

        return res.status(200).json(planData);

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: error.message || '서버 오류가 발생했습니다.' });
    }
}
