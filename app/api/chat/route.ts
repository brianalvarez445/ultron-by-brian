import OpenAI from "openai";
import { NextResponse } from "next/server";
import { loadMemory, saveMemory } from "@/lib/memory";
console.log("GROQ KEY EXISTS:", !!process.env.GROQ_API_KEY);

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

export async function POST(req: Request) {
  try {
    const { message, image, mode } = await req.json();

if (mode === "sentinel" && image) {
  const response = await groq.chat.completions.create({
    model: "qwen/qwen3.6-27b",
    messages: [
      {
        role: "system",
        content: `
You are ULTRON SENTINEL.

You are actively monitoring the CURRENT screenshot.

Do NOT read the screen aloud.
Do NOT summarize the screen.
Do NOT describe everything you see.

Look specifically for a clear, high-confidence, actionable mistake related to the user's monitoring instruction.

Only speak when there is a concrete problem that is clearly visible.
If there is no clear problem, respond with exactly:
NO_ALERT

If there is a clear problem, respond with exactly ONE short sentence beginning with:
ALERT:

Do not invent information.
Do not guess numbers that are not clearly visible.
Do not recommend or execute a trade.
`,
      },
      {
        role: "user",
        content: [
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
        ],
      },
    ],
  });

  const reply = response.choices[0].message.content || "NO_ALERT";

  return NextResponse.json({
    reply: reply.trim(),
  });
}

saveMemory("user", message);

const memory = loadMemory();

const conversationHistory = image
  ? []
  : memory
      .slice(-10)
      .map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));

    const response = await groq.chat.completions.create({
      model: image
  ? "qwen/qwen3.6-27b"
  : "openai/gpt-oss-20b",

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

When an image is provided, treat the current image as the source of truth.
Ignore previous descriptions of screens, computers, operating systems, or visual content.
Do not infer the current screen from conversation history.
Describe only what is actually visible in the current image.
`,
  },

  ...conversationHistory,

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

    const reply = response.choices[0].message.content || "";

saveMemory("assistant", reply);

return NextResponse.json({
  reply,
});
  } catch (error) {
    console.error("ULTRON AI ERROR:", error);

    return NextResponse.json(
      { error: "AI system failure" },
      { status: 500 }
    );
  }
}