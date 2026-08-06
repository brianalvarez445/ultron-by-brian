import OpenAI from "openai";
import { NextResponse } from "next/server";

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function POST(req: Request) {
  try {
    const { image, question } = await req.json();

    const response = await groq.chat.completions.create({
      model: "qwen-3.6-27b",
      messages: [
        {
          role: "system",
          content:
            "You are ULTRON. Analyze the user's screenshot carefully and answer only what they ask.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: question,
            },
            {
              type: "image_url",
              image_url: {
                url: image,
              },
            },
          ],
        },
      ],
    });

    return NextResponse.json({
      reply: response.choices[0].message.content,
    });
  } catch (error) {
    console.error("VISION ERROR:", error);

    return NextResponse.json(
      {
        error: "Vision system failure",
      },
      {
        status: 500,
      }
    );
  }
}