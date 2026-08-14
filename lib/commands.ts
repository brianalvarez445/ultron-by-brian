export type BrowserAction =
  | {
      type: "open";
      target: string;
    }
  | {
      type: "search";
      engine: "google" | "youtube" | "bing";
      query: string;
    };

export function parseBrowserCommand(message: string): BrowserAction | null {
  const command = message
    .toLowerCase()
    .replace(/^ultron[\s,.:!-]*/i, "")
    .trim();

  if (!command) return null;

  // Search: "search YouTube for Kia stream"
  // Search: "find Kia stream on YouTube"
  const searchMatch = command.match(
    /^(?:search|find|look up)\s+(?:(google|youtube|bing)\s+)?(?:for\s+)?(.+?)(?:\s+on\s+(google|youtube|bing))?$/i
  );

  if (searchMatch) {
    const engine = (
      searchMatch[1] ||
      searchMatch[3] ||
      "google"
    ) as "google" | "youtube" | "bing";

    const query = searchMatch[2].trim();

    if (query) {
      return {
        type: "search",
        engine,
        query,
      };
    }
  }

  // Open: "open Instagram"
  // Open: "launch YouTube"
  // Open: "go to GitHub"
  const openMatch = command.match(
    /^(?:open|launch|go to)\s+(.+)$/i
  );

  if (openMatch) {
    return {
      type: "open",
      target: openMatch[1].trim(),
    };
  }

  return null;
}