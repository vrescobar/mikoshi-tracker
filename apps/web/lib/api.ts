function joinPath(path: string, baseUrl: string) {
  return new URL(path, baseUrl).toString();
}

/**
 * API URL for browser fetches. Defaults to a relative path (same-origin via
 * the Caddy proxy in production, the Vite dev/preview proxy locally);
 * VITE_API_BASE_URL overrides it for split-origin deployments.
 */
export function createApiUrl(path: string) {
  const publicBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return publicBaseUrl ? joinPath(path, publicBaseUrl) : path;
}
