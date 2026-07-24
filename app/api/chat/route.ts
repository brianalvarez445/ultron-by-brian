import OpenAI from "openai";
import { NextResponse } from "next/server";
console.log("GROQ KEY EXISTS:", !!process.env.GROQ_API_KEY);
const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    const response = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: "You are ULTRON, an advanced AI assistant.",
        },
        {
          role: "user",
          content: message,
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
