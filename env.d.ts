/** Variáveis de ambiente exigidas pela aplicação, independentes de plataforma. */
declare namespace NodeJS {
  interface ProcessEnv {
    SUPABASE_GATEWAY_URL: string;
    SUPABASE_GATEWAY_KEY: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    GOOGLE_WORKSPACE_DOMAIN?: string;
    AUTH_SESSION_SECRET: string;
  }
}
