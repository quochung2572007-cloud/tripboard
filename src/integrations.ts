/**
 * Integration Billing Config — who pays for each integration's calls.
 *
 * Tripboard calls every integration from server actions, which check trip
 * membership and apply per-user / per-trip daily quotas before spending
 * (src/actions/helpers.ts → takeQuota). So the app owner pays ('developer'),
 * and friends invited by link never need DeepSpace credits of their own.
 * None of these allow anonymous callers.
 *
 * Any integration backed by per-user connected accounts (Google, Composio)
 * must stay 'user'.
 */

export const integrations: Record<
  string,
  { billing: 'developer' | 'user'; anonymous?: boolean }
> = {
  exa: { billing: 'developer' },
  anthropic: { billing: 'developer' },
  openweathermap: { billing: 'developer' },
  email: { billing: 'developer' },
  google: { billing: 'user' },
  composio: { billing: 'user' },
}
