export function track(event: string, props?: Record<string, string | number | boolean>) {
  console.log('[track]', event, props);
}
