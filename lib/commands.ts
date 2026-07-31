export type UltronCommand =
  | "open_vscode"
  | "open_project"
  | "open_website"
  | "unknown";

export async function executeCommand(command: UltronCommand) {
  switch (command) {
    case "open_vscode":
      console.log("🖥️ Opening VS Code...");
      break;

    case "open_project":
      console.log("📂 Opening project...");
      break;

    case "open_website":
      console.log("🌐 Opening website...");
      break;

    default:
      console.log("❌ Unknown command.");
  }
}