/** Guest exploration must not call the stateful shared-world read endpoint. */
export function canReadSharedWorld(configured: boolean, session: string): boolean {
  return configured && session === 'ready';
}
