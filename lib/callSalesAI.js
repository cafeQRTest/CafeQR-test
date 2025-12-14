// lib/callSalesAI.js
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export async function generateSalesSuggestionsStream(summaryForAI) {
  // Use 'gemini-2.0-flash' or 'gemini-1.5-flash' depending on what keys you have access to.
  // 1.5-flash is generally very stable and fast.
  const model = genAI.getGenerativeModel({
    model: process.env.AI_MODEL_NAME || "gemini-1.5-flash",
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

  try {
    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      systemInstruction,
    });
    
    // Return the stream directly
    return result.stream;
  } catch (error) {
    console.error("Gemini Stream Error:", error);
    throw new Error("AI Stream Failed");
  }
}
