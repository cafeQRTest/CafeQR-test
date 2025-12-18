// lib/callSalesAI.js
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Load keys and clean them up (remove whitespace)
const API_KEYS = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "")
  .split(",")
  .map((k) => k.trim())
  .filter((k) => k.length > 0);

if (API_KEYS.length === 0) {
  console.error("CRITICAL: No valid GEMINI_API_KEYS found in environment variables.");
}

// Helper to get a random key
function getRandomKey() {
  const randomIndex = Math.floor(Math.random() * API_KEYS.length);
  return API_KEYS[randomIndex];
}

export async function generateSalesSuggestionsStream(summaryForAI) {
  try {
    // 2. Rotate Key: Pick a fresh key for this specific request
    const currentKey = getRandomKey();
    
    // Initialize client inside the function scope with the chosen key
    const genAI = new GoogleGenerativeAI(currentKey);

    const model = genAI.getGenerativeModel({
      model: process.env.AI_MODEL_NAME || "gemini-2.5-flash",
    });

    const systemInstruction = `
You are an expert restaurant consultant. Analyze the data to provide a "Sales & Profit Boost Plan".
Be specific, actionable, and brutal about financial reality.
If margins seem unrealistically high (>50%), assume expenses are not fully tracked and warn the user.
Do not use markdown bolding (**) excessively, keep it clean.
    `;

    const userPrompt = `
Analyze this restaurant (${summaryForAI.restaurant?.name}) based on the data below.
- Revenue: ₹${summaryForAI.totalRevenue}
- Expenses: ₹${summaryForAI.financialStats.totalExpenses} (Note: If low, assume missing data)
- Margin: ${((summaryForAI.financialStats.netProfitAccrual / summaryForAI.financialStats.grossSales || 0) * 100).toFixed(1)}%
- Top Items: ${JSON.stringify(summaryForAI.topItems.map(i => i.name))}
- Hourly Peak: ${JSON.stringify(summaryForAI.hourlyData.sort((a,b)=>b.revenue-a.revenue).slice(0,3))}

Structure the response EXACTLY like this:
# Sales & Profit Boost Plan
## Financial Reality Check
(Assess margin and cash flow. If expenses are 0, say "You are not tracking expenses!")
## 3 Immediate Actions to Increase Sales
1. [Action Name]: [Why] -> [How]
2. [Action Name]: [Why] -> [How]
3. [Action Name]: [Why] -> [How]
## Menu & Pricing Tweaks
(Based on top/weak items)
    `;

    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction,
    });

    return result.stream;

  } catch (error) {
    // Enhanced error logging to see which key failed (masked for security)
    console.error(`Gemini Stream Error (Key ends in ...${getRandomKey().slice(-4)}):`, error.message);
    throw new Error("AI Stream Failed");
  }
}
