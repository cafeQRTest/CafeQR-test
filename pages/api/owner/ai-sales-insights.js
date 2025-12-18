// pages/api/owner/ai-sales-insights.js
import { createClient } from '@supabase/supabase-js'; 
import { istSpanFromDatesUtcISO } from "../../../utils/istTime";
import { generateSalesSuggestionsStream } from "../../../lib/callSalesAI";

// IMPORTANT: This enables streaming on Vercel Free Tier
export const runtime = 'edge';

const getEdgeSupabase = () => {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
};

export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const body = await req.json();
    const { restaurantId, timeRange = "today" } = body;

    if (!restaurantId) return new Response("Missing restaurantId", { status: 400 });

    const supabase = getEdgeSupabase();
    
    // --- DATA FETCHING ---
    const now = new Date();
    const start = new Date();
    if (timeRange === 'week') start.setDate(now.getDate() - 7);
    else if (timeRange === 'month') start.setDate(now.getDate() - 30);
    else start.setHours(0,0,0,0);
    const { startUtc, endUtc } = istSpanFromDatesUtcISO(start, now);

    // Fetching data
    const [restRes, ordersRes, expensesRes, hoursRes] = await Promise.all([
      supabase.from("restaurants").select("name").eq("id", restaurantId).single(),
      supabase.from("orders").select("total_inc_tax, total_amount, items, created_at").eq("restaurant_id", restaurantId).gte("created_at", startUtc).lt("created_at", endUtc).neq("status", "cancelled"),
      supabase.from("expenses").select("amount").eq("restaurant_id", restaurantId).gte("expense_date", startUtc).lte("expense_date", endUtc),
      supabase.from("restaurant_hours").select("*").eq("restaurant_id", restaurantId)
    ]);

    const orders = ordersRes.data || [];
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total_inc_tax || o.total_amount || 0), 0);
    const totalExpenses = (expensesRes.data || []).reduce((sum, e) => sum + (e.amount || 0), 0);
    
    const itemCounts = {};
    orders.forEach(o => o.items?.forEach(i => itemCounts[i.name] = (itemCounts[i.name] || 0) + (Number(i.quantity) || 1)));
    const topItems = Object.entries(itemCounts).sort(([,a], [,b]) => b-a).slice(0, 5).map(([n,q]) => ({name: n, quantity: q}));
    
    const hourlyMap = {};
    orders.forEach(o => {
        const h = new Date(o.created_at).getUTCHours(); 
        hourlyMap[h] = (hourlyMap[h] || 0) + (o.total_inc_tax || 0);
    });
    const hourlyData = Object.entries(hourlyMap).map(([h, rev]) => ({ hour: h, revenue: rev }));

    const summary = {
      restaurant: { name: restRes.data?.name },
      totalRevenue,
      financialStats: { totalExpenses, grossSales: totalRevenue, netProfitAccrual: totalRevenue - totalExpenses },
      topItems,
      hourlyData,
      openingHours: hoursRes.data || []
    };

    // --- STREAMING RESPONSE ---
    const geminiStream = await generateSalesSuggestionsStream(summary);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of geminiStream) {
            const text = chunk.text();
            if (text) controller.enqueue(encoder.encode(text));
          }
        } catch (e) {
          controller.enqueue(encoder.encode("\n\n[Error generating full report]"));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
