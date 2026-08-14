import { NextResponse } from "next/server";
import { parseBrowserCommand } from "@/lib/commands";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Message is required",
        },
        {
          status: 400,
        }
      );
    }

    const action = parseBrowserCommand(message);

    console.log("ULTRON BROWSER COMMAND:", message);
    console.log("PARSED ACTION:", action);

    return NextResponse.json({
      success: true,
      action,
    });
  } catch (error) {
    console.error("COMMAND ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Command parsing failed",
      },
      {
        status: 500,
      }
    );
  }
}