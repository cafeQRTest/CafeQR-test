
import OpenAI from 'openai';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ message: 'No image provided' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ message: 'OpenAI API key not configured' });
    }

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this menu image. Extract all food/drink items. Return a JSON object with a key 'items' which is an array of objects. Each object should have: 'name' (string), 'price' (number, just the value), 'category' (string estimate), 'veg' (boolean, true if likely vegetarian), 'description' (string, optional). Do not include any other text." },
            {
              type: "image_url",
              image_url: {
                "url": image, // Expecting data:image/jpeg;base64,...
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;
    const json = JSON.parse(content);

    res.status(200).json(json);

  } catch (error) {
    console.error('AI Parse Error:', error);
    res.status(500).json({ message: error.message || 'Failed to parse image' });
  }
}
