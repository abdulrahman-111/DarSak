/** Display-only marker set after Edge validates the Google callback proof. */
export function googleReauthHint(intentId: string, ownerId: string) {
  return `${intentId}:${ownerId}`;
}
export function googleReauthHintMatches(
  value: string | undefined,
  intentId: string | undefined,
  ownerId: string | undefined,
) {
  return !!value && !!intentId && !!ownerId && value === googleReauthHint(intentId, ownerId);
}
