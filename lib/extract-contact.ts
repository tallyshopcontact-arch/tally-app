export function extractEmail(text: string): string | null {
  const m = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

export function extractInstagram(text: string): string | null {
  const patterns = [
    /instagram\.com\/([a-zA-Z0-9._]{3,30})/i,
    /ig[:\s]+@?([a-zA-Z0-9._]{3,30})/i,
    /insta[:\s]+@?([a-zA-Z0-9._]{3,30})/i,
    /(?:^|\s)@([a-zA-Z0-9._]{3,30})(?:\s|$)/m,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

export interface ContactInfo {
  email: string | null;
  instagram: string | null;
  contactMethod: "email" | "instagram" | "none";
}

export function extractContactInfo(text: string): ContactInfo {
  const email = extractEmail(text);
  const instagram = extractInstagram(text);
  return {
    email,
    instagram,
    contactMethod: email ? "email" : instagram ? "instagram" : "none",
  };
}
