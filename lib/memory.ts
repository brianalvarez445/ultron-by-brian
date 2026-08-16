import fs from "fs";
import path from "path";

const MEMORY_FILE = path.join(
  process.cwd(),
  "memory",
  "conversations.json"
);

export type MemoryEntry = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export function loadMemory(): MemoryEntry[] {
  try {
    const data = fs.readFileSync(MEMORY_FILE, "utf8");

    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function saveMemory(
  role: "user" | "assistant",
  content: string
): void {
  const memory = loadMemory();

  memory.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  fs.writeFileSync(
    MEMORY_FILE,
    JSON.stringify(memory, null, 2)
  );
}