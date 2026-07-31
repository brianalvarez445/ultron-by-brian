import { NextResponse } from "next/server";
import { executeCommand, UltronCommand } from "@/lib/commands";

export async function POST(req: Request) {
  try {
    const { command } = await req.json();

    console.log("ULTRON COMMAND:", command);

    await executeCommand(command as UltronCommand);

    return NextResponse.json({
      success: true,
      command,
    });
  } catch (error) {
    console.error("COMMAND ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Command execution failed",
      },
      {
        status: 500,
      }
    );
  }
}