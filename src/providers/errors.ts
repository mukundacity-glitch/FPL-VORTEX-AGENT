/** Map provider failures to safe instructions without exposing raw payloads. */
export function providerErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== "object" || error === null) return fallback;
  const failure = error as { status?: number; code?: string; type?: string };
  if (
    failure.code === "credit_balance_exhausted" ||
    failure.code === "insufficient_quota" ||
    failure.type === "insufficient_quota"
  )
    return "Your API account has no available credits or has reached its spending limit. Add API credits or adjust the account/project billing limit, then try again.";
  if (failure.status === 401)
    return "The provider rejected the API key. Update the server key and restart Vortex.";
  if (failure.status === 429)
    return "The provider rate limit was reached. Wait briefly before trying again.";
  return fallback;
}
