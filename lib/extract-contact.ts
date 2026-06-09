// ── Helpers ───────────────────────────────────────────────────────────────────

// Words that look like handles but aren't Instagram usernames
const FALSE_POSITIVE_HANDLES = new Set([
  "gmail", "yahoo", "hotmail", "outlook", "icloud", "protonmail",
  "beats", "music", "youtube", "instagram", "facebook", "twitter",
  "tiktok", "soundcloud", "spotify", "apple", "google",
]);

function isLikelyHandle(handle: string): boolean {
  return (
    handle.length >= 3 &&
    handle.length <= 30 &&
    !FALSE_POSITIVE_HANDLES.has(handle.toLowerCase())
  );
}

// ── Email ─────────────────────────────────────────────────────────────────────

export function extractEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

// ── Instagram ─────────────────────────────────────────────────────────────────

export function extractInstagram(text: string, label = ""): string | null {
  // Ordered most-specific → least-specific to minimise false positives

  const patterns: Array<[RegExp, string]> = [
    // Full URL with or without trailing slash
    [/instagram\.com\/([a-zA-Z0-9._]{3,30})\/?(?:\s|$|"|'|\))/i, "instagram.com/handle"],

    // "follow me on instagram @handle" / "follow me on instagram: handle"
    [/follow(?:\s+me)?(?:\s+on)?\s+instagram[:\s]+@?([a-zA-Z0-9._]{3,30})/i, "follow on instagram"],

    // "instagram: @handle" or "instagram - @handle"
    [/instagram[:\s\-]+@?([a-zA-Z0-9._]{3,30})/i, "instagram: handle"],

    // "ig: handle" or "ig: @handle"
    [/\big[:\s]+@?([a-zA-Z0-9._]{3,30})/i, "ig: handle"],

    // "insta: handle"
    [/\binsta[:\s]+@?([a-zA-Z0-9._]{3,30})/i, "insta: handle"],

    // "@handle" not preceded by alphanumeric (i.e. not part of an email)
    [/(?<![a-zA-Z0-9._%+\-])@([a-zA-Z0-9._]{3,30})(?!\.[a-zA-Z])/m, "@handle standalone"],
  ];

  for (const [pattern, patternName] of patterns) {
    const m = text.match(pattern);
    if (m?.[1] && isLikelyHandle(m[1])) {
      console.log(`[extract-contact]${label} instagram match via "${patternName}": ${m[1]}`);
      return m[1];
    }
  }

  return null;
}

// ── Linktree ──────────────────────────────────────────────────────────────────

export function hasLinktree(text: string): boolean {
  return /linktr\.ee\/[a-zA-Z0-9._]+/i.test(text) ||
    /linktree\.com\/[a-zA-Z0-9._]+/i.test(text);
}

// ── Combined ──────────────────────────────────────────────────────────────────

export interface ContactInfo {
  email: string | null;
  instagram: string | null;
  contactMethod: "email" | "instagram" | "check_manually";
}

export function extractContactInfo(text: string, channelName = ""): ContactInfo {
  const label = channelName ? ` [${channelName}]` : "";
  console.log(`[extract-contact]${label} searching ${text.length} chars of text`);

  const email = extractEmail(text);
  if (email) {
    console.log(`[extract-contact]${label} found email: ${email}`);
    return { email, instagram: null, contactMethod: "email" };
  }

  const instagram = extractInstagram(text, label);
  if (instagram) {
    return { email: null, instagram, contactMethod: "instagram" };
  }

  if (hasLinktree(text)) {
    console.log(`[extract-contact]${label} found linktree — flagging check_manually`);
  } else {
    console.log(`[extract-contact]${label} no contact found — flagging check_manually`);
  }

  return { email: null, instagram: null, contactMethod: "check_manually" };
}
