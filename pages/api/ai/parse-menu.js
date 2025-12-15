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

/**
 * Reads keys from env, splits by comma, and shuffles them slightly
 * to ensure we don't always hammer Key #1 first.
 */
function getApiKeys() {
  // Use GEMINI_API_KEYS (plural) for the list, fallback to singular if needed
  const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const keys = keysEnv.split(",").map(k => k.trim()).filter(Boolean);
  
  // Fisher-Yates shuffle to randomize order for load balancing
  // (We want to try all keys, but in random order)
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  
  return keys;
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

    const match = image.match(/^data:(.+);base64,(.*)$/);
    if (!match) {
      return new Response(
        JSON.stringify({ message: "Invalid image format. Expected data URL." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    const mimeType = match[1];
    const base64Data = match[2];

    const apiKeys = getApiKeys();
    if (apiKeys.length === 0) {
      return new Response(
        JSON.stringify({ message: "GEMINI_API_KEYS not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

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

    // Try keys sequentially until one works or all fail
    let lastError = null;
    let successResponse = null;

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
          console.warn(`Key ${key.slice(0, 5)}... rate limited. Retrying next key.`);
          lastError = { status: 429, message: "Rate limit exceeded" };
          continue; // Try next key
        }

        if (!resp.ok) {
          const txt = await resp.text();
          console.error(`Key ${key.slice(0, 5)}... failed with ${resp.status}: ${txt}`);
          lastError = { status: resp.status, message: txt };
          // If it's a 5xx error, maybe retry? For now, we assume broken keys/requests shouldn't retry indefinitely unless it's 429
          // But to be safe, let's continue to next key for any 5xx server error too
          if (resp.status >= 500) continue; 
          break; // Don't retry client errors (400, 401, etc)
        }

        const raw = await resp.json();
        const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const parsed = safeJsonParse(text); // This might throw if invalid JSON

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

        successResponse = normalized;
        break; // Success! Stop loop

      } catch (err) {
        console.error(`Key ${key.slice(0, 5)}... error:`, err);
        lastError = { status: 500, message: err.message };
        // Continue to next key on fetch/network/parse error
      }
    }

    if (successResponse) {
      return new Response(JSON.stringify(successResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // If we exhausted all keys
    const finalStatus = lastError?.status || 500;
    const finalMsg = lastError?.message || "All API keys failed or were rate limited.";
    
    return new Response(JSON.stringify({ message: "Gemini error", details: finalMsg }), {
      status: finalStatus,
      headers: { "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("Critical Parse Error:", e);
    return new Response(
      JSON.stringify({ message: e.message || "Failed to parse image" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
