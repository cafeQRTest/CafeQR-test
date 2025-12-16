export const config = {
  maxDuration: 60, // Vercel limit
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

// Strict schema to ensure valid JSON output
const MENU_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          category: { type: "STRING" },
          price: { type: "NUMBER" },
          veg: { type: "BOOLEAN" },
          description: { type: "STRING" },
          variants: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                template: { type: "STRING" },
                required: { type: "BOOLEAN" },
                options: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      name: { type: "STRING" },
                      price: { type: "NUMBER" },
                    },
                    required: ["name", "price"],
                  },
                },
              },
              required: ["template", "options"],
            },
          },
        },
        required: ["name", "price"],
      },
    },
  },
  required: ["items"],
};

function getApiKeys() {
  const keysEnv = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "";
  const keys = keysEnv.split(",").map((k) => k.trim()).filter(Boolean);
  // Randomize keys to distribute load
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Method not allowed" });

  // Hard deadline to return response before Vercel kills the process (60s limit)
  const HARD_DEADLINE = Date.now() + 56_000;

  try {
    const { image } = req.body || {};
    if (!image || typeof image !== "string") {
      return res.status(400).json({ message: "No image provided" });
    }

    // 1. Basic Image Validation
    const match = image.match(/^data:(.+);base64,(.*)$/);
    if (!match) return res.status(400).json({ message: "Invalid image format." });

    const mimeType = match[1];
    const base64Data = match[2];

    // 2. Size Guard (Keep payload reasonable)
    if (base64Data.length > 3_000_000) { // ~2.2MB
      return res.status(413).json({ message: "Image too large. Please resize below 2MB." });
    }

    const apiKeys = getApiKeys();
    if (!apiKeys.length) return res.status(500).json({ message: "Server config error: No API keys." });

    let lastError = null;
    let successData = null;

    // 3. Retry Loop
    // We try multiple keys or retries on the same key if it's just "busy"
    mainLoop: for (const key of apiKeys) {
      if (successData) break;

      // Attempt up to 2 times per key
      for (let attempt = 1; attempt <= 2; attempt++) {
        // Stop if we are running out of time
        if (Date.now() > HARD_DEADLINE - 8000) break mainLoop;

        // Give Gemini 25s to think (it needs it for complex menus)
        const requestTimeoutMs = 25_000; 

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);

          // USING gemini-2.5-flash (Correct Model)
          const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
          
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: [
                  { text: "Extract menu items to JSON. Be precise with prices." },
                  { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
              }],
              generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 8192, // High limit prevents cut-off JSON
                response_mime_type: "application/json",
                response_schema: MENU_SCHEMA
              }
            }),
            signal: controller.signal
          }).finally(() => clearTimeout(timeoutId));

          // Handle "Busy" vs "Broken"
          if (!response.ok) {
            // 404 = Wrong Model Name (Don't retry, just fail)
            if (response.status === 404) {
               throw new Error("Gemini Model Not Found (Check API version/model name)");
            }
            
            // 429 (Rate Limit) or 503 (Overloaded) -> RETRY
            if (response.status === 429 || response.status === 503) {
              lastError = { status: 503, message: "AI is busy, retrying..." };
              console.log(`Gemini Busy (${response.status}), retrying...`);
              await sleep(2000 * attempt); // Wait 2s, then 4s
              continue; 
            }

            const errText = await response.text();
            throw new Error(`Gemini Error ${response.status}: ${errText}`);
          }

          const data = await response.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

          if (!text) throw new Error("Empty response from AI");

          successData = JSON.parse(text);
          break mainLoop; // Success!

        } catch (err) {
          const isTimeout = err.name === "AbortError";
          if (isTimeout) {
            console.log(`Attempt ${attempt} timed out (frontend will retry if needed)`);
            lastError = { status: 504, message: "AI took too long." };
          } else {
            console.error(`Attempt ${attempt} error:`, err.message);
            lastError = { status: 500, message: err.message };
            // If it was a 404 or bad request, break loop immediately
            if (err.message.includes("404") || err.message.includes("400")) break mainLoop;
          }
          
          // Small pause before next attempt
          if (Date.now() < HARD_DEADLINE - 5000) await sleep(1000);
        }
      }
    }

    if (successData) {
      // Normalize output
      const items = Array.isArray(successData.items) ? successData.items : [];
      const normalized = items.map(i => ({
        name: (i.name || "").trim(),
        category: (i.category || "General").trim(),
        price: Number(i.price) || 0,
        veg: !!i.veg,
        description: (i.description || "").trim(),
        variants: Array.isArray(i.variants) ? i.variants : []
      }));
      return res.status(200).json({ items: normalized });
    }

    // Graceful Failure
    return res.status(lastError?.status || 503).json({
      message: "Menu extraction failed.",
      details: lastError?.message || "Please try again later."
    });

  } catch (e) {
    console.error("Critical Error:", e);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}
