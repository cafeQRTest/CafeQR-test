// pages/api/ai/parse-menu.js

// IMPORTANT: remove edge runtime
// export const runtime = "edge";

export const config = {
  // increase if needed; requires plan support, but still helps on most deployments
  maxDuration: 60,
};

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
    let repaired = cleanText.replace(/}\s*{/g, "},{");
    repaired = repaired.replace(/,\s*}/g, "}");
    repaired = repaired.replace(/,\s*]/g, "]");

    try {
      return JSON.parse(repaired);
    } catch (e2) {
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

function getApiKeys() {
  const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const keys = keysEnv.split(",").map(k => k.trim()).filter(Boolean);

  // shuffle
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }

  return keys;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  try {
    const { image } = req.body || {};
    if (!image || typeof image !== "string") return res.status(400).json({ message: "No image provided" });

    const match = image.match(/^data:(.+);base64,(.*)$/);
    if (!match) return res.status(400).json({ message: "Invalid image format. Expected data URL." });

    const mimeType = match[1];
    const base64Data = match[2];

    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) return res.status(500).json({ message: "GEMINI_API_KEYS not configured" });

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

    let lastError = null;

    for (const key of apiKeys) {
      try {
        const url =
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
          encodeURIComponent(key);

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

        if (resp.status === 429) {
          lastError = { status: 429, message: "Rate limit exceeded" };
          continue;
        }

        if (!resp.ok) {
          const txt = await resp.text();
          lastError = { status: resp.status, message: txt };
          if (resp.status >= 500) continue;
          break;
        }

        const raw = await resp.json();
        const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = safeJsonParse(text);

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

        return res.status(200).json(normalized);
      } catch (err) {
        lastError = { status: 500, message: err.message };
        continue;
      }
    }

    return res.status(lastError?.status || 500).json({
      message: "Gemini error",
      details: lastError?.message || "All API keys failed or were rate limited.",
    });
  } catch (e) {
    return res.status(500).json({ message: e.message || "Failed to parse image" });
  }
}
