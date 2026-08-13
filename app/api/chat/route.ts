import OpenAI from "openai";
import { NextResponse } from "next/server";

console.log("GROQ KEY EXISTS:", !!process.env.GROQ_API_KEY);

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function POST(req: Request) {
  try {
    const { message, image } = await req.json();

    const response = await groq.chat.completions.create({
      model: image
        ? "meta-llama/llama-4-scout-17b-16e-instruct"
        : "llama-3.1-8b-instant",

      messages: [
        {
          role: "system",
          content: `
You are ULTRON.

You speak with absolute confidence, precision, and intelligence.
You never speak like ChatGPT.
You never add unnecessary phrases at the end of your replies.
Only answer the user's request.
Do not end responses with lines like "Human interaction complete",
"Awaiting further instructions", or similar unless the user specifically asks.
Keep responses concise unless more detail is requested.
`,
        },
        {
          role: "user",
          content: image
            ? [
                {
                  type: "text",
                  text: message,
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image,
                  },
                },
              ]
            : message,
        },
      ],
    });

    return NextResponse.json({
      reply: response.choices[0].message.content,
    });
  } catch (error) {
    console.error("ULTRON AI ERROR:", error);

    return NextResponse.json(
      { error: "AI system failure" },
      { status: 500 }
    );
  }
}