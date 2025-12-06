// lib/callSalesAI.js
import OpenAI from 'openai';

// Single Perplexity client reused across calls
const client = new OpenAI({
  apiKey: process.env.PERPLEXITY_API_KEY,
  baseURL: 'https://api.perplexity.ai', // Perplexity OpenAI-compatible endpoint
});

// summaryForAI is the object you build in ai-sales-insights.js
export async function generateSalesSuggestions(summaryForAI) {
  const {
    timeRange,
    dateRangeLabel,
    daysInRange,
    restaurant,
    totalOrders,
    totalRevenue,
    avgOrderValue,
  } = summaryForAI;

  const systemPrompt = `
You are an expert restaurant growth and profitability consultant.
Your job is to turn POS, expense, credit, and opening-hours data
into 3–7 specific, low-cost, high-impact actions that a small restaurant in India
can implement THIS WEEK to grow sales, improve profit margin, and stabilise cash flow.

Always consider:
- Menu and pricing
- Promotions and offers
- Peak/slow time strategy and opening hours
- Upsell/add-ons/combos
- Operations (staffing, prep, inventory, waste)
- Credit policy and collections
- Basic profit & loss and cash flow insights

Use simple language and clear steps. Do not mention that you are an AI model.
`;


const userPrompt = `
Restaurant context:
- Name: ${restaurant?.name || 'Unknown Restaurant'}
- Location: ${restaurant?.city || 'Unknown city'}, ${restaurant?.state || 'Unknown state'} ${restaurant?.pincode || ''}
- Type: ${restaurant?.category || 'N/A'} / ${restaurant?.subcategory || 'N/A'}
- Period analysed (${timeRange}): ${dateRangeLabel} (about ${daysInRange} day(s))
- Orders: ${totalOrders}
- Revenue: ₹${totalRevenue.toFixed(2)}
- Avg order value: ₹${avgOrderValue.toFixed(2)}

Financial snapshot for this period:
${JSON.stringify(summaryForAI.financialStats, null, 2)}

Opening hours and demand:
- Configured hours per weekday and actual orders per hour:
${JSON.stringify({ openingHours: summaryForAI.openingHours, hourlyData: summaryForAI.hourlyData }, null, 2)}

Structured POS and ledger data:
${JSON.stringify(summaryForAI, null, 2)}

Instructions:
1) Use sales + expenses + credit + opening-hours data as the main source of truth.
2) Explicitly comment on:
   - whether profit margin and cash position look healthy,
   - whether credit is under control or risky,
   - whether current opening hours match demand.
3) Then output markdown in this structure:

# Quick Wins to Boost Sales and Profit This Week

Short 1–2 sentence summary...

## Menu and Pricing
...

## Promotions and Offers
...

## Peak and Slow Time Strategy
...

## Upsell, Add-Ons, and Combos
...

## Operations, Expenses, and Credit Control
...

Each bullet must be realistic within a week and mention the expected impact (extra orders, higher average ticket, or better net profit).
`;

  const completion = await client.chat.completions.create({
    model: process.env.AI_MODEL_NAME || 'sonar', // can switch to 'sonar-pro' later
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.6,
    max_tokens: 700,
    // NEW: let Sonar decide when to use web search for local/market info
    enable_search_classifier: true,
  });

  return completion.choices?.[0]?.message?.content?.trim() || '';
}
