export function canSharePublicGroup(
  publicProjectionAvailable: boolean,
  groupStatus: string,
): boolean {
  return publicProjectionAvailable && groupStatus === 'published';
}
