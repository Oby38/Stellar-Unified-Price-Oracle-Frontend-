export const config = {
  apiUrl: import.meta.env.VITE_API_URL || '/api',
  wsUrl: import.meta.env.VITE_WS_URL || 'ws://localhost:3000',
  wsAuthUrl: import.meta.env.VITE_WS_AUTH_URL || '/api/auth/ws-token',
  refreshInterval: 10_000,
  wsReconnectDelay: 3_000,
  wsBroadcastInterval: 5_000,
  analyticsEndpoint: import.meta.env.VITE_ANALYTICS_URL ?? '',
} as const
