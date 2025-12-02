// lib/callSalesAI.js
import OpenAI from 'openai';

// Single Perplexity client reused across calls
const client = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai', // Perplexity OpenAI-compatible endpoint
});

// summaryForAI is the object you build in ai-sales-insights.js
export async function generateSalesSuggestions(summaryForAI) {
  const { timeRange } = summaryForAI;

  const systemPrompt = `
You are an expert restaurant growth consultant.
Given structured POS data, produce 3–7 specific, low-cost actions
to increase sales and average order value for a small restaurant in India.
Use simple language, bullet points, and focus on things that can be done this week.
Do not mention that you are an AI model.
`;

  const userPrompt = `
Here is this restaurant's data for the period "${timeRange}":
${JSON.stringify(summaryForAI, null, 2)}

Based on this, suggest practical actions in these buckets where relevant:
- Menu and pricing
- Promotions and offers
- peak/slow time strategy
- upsell/add-ons and combos
- operational tweaks (staffing, prep, inventory)

The suggestions must be:
- actionable this week
- specific to a small restaurant
- phrased as bullet points with short explanations.
`;

  const completion = await client.chat.completions.create({
    model: process.env.AI_MODEL_NAME || 'sonar', // can switch to 'sonar-pro' later
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 600,
  });

  return completion.choices?.[0]?.message?.content?.trim() || '';
}
