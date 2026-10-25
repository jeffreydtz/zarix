/** Optional OAuth 2.1 for MCP. Off by default. PAT remains the supported auth. */
export function mcpOAuthEnabled(): boolean {
  const raw = process.env.ZARIX_MCP_OAUTH_ENABLED?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function mcpOAuthIssuer(): string | null {
  const issuer = process.env.ZARIX_OAUTH_ISSUER?.trim();
  return issuer || null;
}
