import type { BrowserAction } from "./commands";

const WEBSITE_MAP: Record<string, string> = {
  youtube: "https://www.youtube.com",
  instagram: "https://www.instagram.com",
  facebook: "https://www.facebook.com",
  twitter: "https://x.com",
  x: "https://x.com",
  github: "https://github.com",
  chatgpt: "https://chatgpt.com",
  google: "https://www.google.com",
  bing: "https://www.bing.com",
};

export function executeBrowserAction(action: BrowserAction): void {
  if (action.type === "search") {
    const encodedQuery = encodeURIComponent(action.query);

    const searchUrls: Record<string, string> = {
      google: `https://www.google.com/search?q=${encodedQuery}`,
      youtube: `https://www.youtube.com/results?search_query=${encodedQuery}`,
      bing: `https://www.bing.com/search?q=${encodedQuery}`,
    };

    window.open(searchUrls[action.engine], "_blank");
    return;
  }

  const target = action.target.toLowerCase().trim();

  if (WEBSITE_MAP[target]) {
    window.open(WEBSITE_MAP[target], "_blank");
    return;
  }

  // Allow direct website commands:
  // "open example.com"
  if (
    target.startsWith("http://") ||
    target.startsWith("https://") ||
    target.includes(".com") ||
    target.includes(".org") ||
    target.includes(".net")
  ) {
    const url = target.startsWith("http")
      ? target
      : `https://${target}`;

    window.open(url, "_blank");
    return;
  }

  console.warn("Unknown browser target:", target);
}