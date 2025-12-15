// pages/api/ai/parse-menu.js
export const runtime = "edge";

/**
 * Attempts to parse JSON. If it fails, tries to "repair" common LLM JSON errors.
 */
function safeJsonParse(text) {
  let cleanText = text.trim();
  const start = cleanText.indexOf("{");
  const end = cleanText.lastIndexOf("}");
  
  if (start !== -1 && end !== -1 && end > start) {
    cleanText = cleanText.slice(start, end + 1);
  }

  try {
    return JSON.parse(cleanText);
  } catch (e1) {
    // Repair: Fix missing commas "}{" -> "},{"
    let repaired = cleanText.replace(/}\s*{/g, "},{");
    // Repair: Fix trailing commas ",}" -> "}"
    repaired = repaired.replace(/,\s*}/g, "}");
    repaired = repaired.replace(/,\s*]/g, "]");

    try {
      return JSON.parse(repaired);
    } catch (e2) {
      // Last ditch: try to close array/obj if truncated
      if (!repaired.endsWith("}")) repaired += "}";
      if (!repaired.endsWith("]")) repaired += "]";
      try {
        return JSON.parse(repaired);
      } catch (e3) {
        throw new Error(`Failed to parse JSON response: ${e1.message}`);
      }
    }
  }
}

function getRandomApiKey() {
  // Supports single key or comma-separated list: "KEY1,KEY2,KEY3"
  const keysEnv = process.env.GEMINI_API_KEY || "";
  const keys = keysEnv.split(",").map(k => k.trim()).filter(Boolean);
  if (keys.length === 0) return null;
  return keys[Math.floor(Math.random() * keys.length)];
}

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ message: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { image } = await req.json();
    if (!image || typeof image !== "string") {
      return new Response(JSON.stringify({ message: "No image provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const apiKey = getRandomApiKey();
    if (!apiKey) {
      return new Response(
        JSON.stringify({ message: "GEMINI_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const match = image.match(/^data:(.+);base64,(.*)$/);
    if (!match) {
      return new Response(
        JSON.stringify({ message: "Invalid image format. Expected data URL." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const mimeType = match[1];
    const base64Data = match[2];

    const prompt = `
Extract menu items from this menu image.

Return ONLY VALID JSON. No markdown. No comments.
Structure:
{
  "items": [
    {
      "name": "Item Name",
      "category": "Category Name",
      "veg": true,
      "description": "Description if present",
      "price": 0,
      "variants": [
        {
          "template": "Size", 
          "required": true,
          "options": [
             { "name": "Small", "price": 100 }
          ]
        }
      ]
    }
  ]
}

Rules:
- Category = heading (BURGER, DRINKS, etc).
- If multiple price columns (VEG/CKN), use variants (template="Type").
- If sizes (S/M/L), use variants (template="Size").
- Single price items: price=number, variants=[].
- Price must be number only.
- veg=true if green dot/symbol visible.
`;

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      encodeURIComponent(apiKey);

    const body = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Data } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
        response_mime_type: "application/json",
      },
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const details = await resp.text();
      // If 429 Resource Exhausted, return helpful message
      if (resp.status === 429) {
         return new Response(JSON.stringify({ message: "Daily quota exceeded. Try again later or add more API keys.", details }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
         });
      }
      return new Response(JSON.stringify({ message: "Gemini error", details }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const raw = await resp.json();
    const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const parsed = safeJsonParse(text);

    // Normalize result
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const normalized = {
      items: items.map((i) => ({
        name: (i?.name || "").trim(),
        category: (i?.category || "Others").trim(),
        veg: !!i?.veg,
        description: (i?.description || "").trim(),
        price: Number(i?.price) || 0,
        variants: Array.isArray(i?.variants) ? i.variants : [],
      })),
    };

    return new Response(JSON.stringify(normalized), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI Parse Error:", e);
    return new Response(
      JSON.stringify({ message: e.message || "Failed to parse image" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
