// Cloudflare Turnstile verification for the public diagnostic endpoint.
// No-op (always passes) until TURNSTILE_SECRET_KEY is set in the environment —
// keeps local dev and early rollout unblocked while the widget/keys are set up.
export async function verifyTurnstileToken(token?: string): Promise<{ success: boolean }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { success: true };

  if (!token) return { success: false };

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = await res.json();
    return { success: !!data.success };
  } catch (e) {
    console.error("[turnstile] verification request failed:", e);
    return { success: false };
  }
}
