import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar | Patrimônio Ops",
  description: "Acesso autorizado ao controle patrimonial.",
};

const messages: Record<string, string> = {
  credentials_invalid_credentials: "Usuário, e-mail ou senha inválidos.",
  credentials_login_failed: "Não foi possível concluir o acesso com senha.",
  credentials_rate_limited: "Muitas tentativas em pouco tempo. Aguarde alguns minutos.",
  credentials_pending_approval:
    "Seu cadastro está aguardando aprovação de um administrador. Você poderá entrar assim que ele for liberado.",
  google_not_configured: "O acesso com Google ainda não foi configurado pelo administrador.",
  google_login_failed: "Não foi possível concluir o acesso com Google.",
  google_not_authorized: "Este e-mail Google não possui permissão para acessar a base.",
  registration_invalid_data:
    "Revise os dados do cadastro. A senha precisa ter ao menos 12 caracteres e ser igual nos dois campos.",
  registration_duplicate:
    "Já existe um acesso ou uma solicitação em andamento para este e-mail ou nome de usuário.",
  registration_rate_limited: "Muitas solicitações em pouco tempo. Aguarde e tente novamente.",
  registration_failed: "Não foi possível registrar a solicitação de acesso.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = single(params.return_to) || "/demo";
  const authError = single(params.auth_error);
  const message = authError ? messages[authError] : null;
  const registered = single(params.registered) === "1";
  const registering = single(params.mode) === "register";
  const query = `?return_to=${encodeURIComponent(returnTo)}`;
  const modeQuery = (mode: "login" | "register") =>
    `/login?return_to=${encodeURIComponent(returnTo)}${mode === "register" ? "&mode=register" : ""}`;

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <header className="login-brand">
          <div className="login-brand-lockup" aria-label="Patrimônio Ops, Gazin">
            <img
              className="login-brand-logo"
              src="/brand/gazin-logo.png"
              alt=""
              width={800}
              height={200}
            />
            <span className="login-brand-copy">
              <strong>Patrimônio Ops</strong>
              <small>Gestão empresarial</small>
            </span>
          </div>
        </header>

        <div className="login-content">
          <p className="eyebrow">Acesso seguro</p>
          <h1 id="login-title">
            {registering ? "Solicitar acesso ao Patrimônio Ops" : "Entrar no Patrimônio Ops"}
          </h1>
          <p className="login-description">
            {registering
              ? "Preencha seus dados. O acesso só é liberado depois que um administrador aprovar a solicitação."
              : "Entre com seu usuário ou e-mail autorizado. O acesso Google continua disponível."}
          </p>

          <nav className="login-modes" aria-label="Formas de acesso">
            <a
              className={`login-mode${registering ? "" : " login-mode-active"}`}
              aria-current={registering ? undefined : "page"}
              href={modeQuery("login")}
            >
              Entrar
            </a>
            <a
              className={`login-mode${registering ? " login-mode-active" : ""}`}
              aria-current={registering ? "page" : undefined}
              href={modeQuery("register")}
            >
              Criar cadastro
            </a>
          </nav>

          {message ? <div className="error-message" role="alert">{message}</div> : null}
          {registered ? (
            <div className="success-message" role="status">
              Cadastro enviado. Um administrador precisa aprovar a solicitação antes do
              primeiro acesso.
            </div>
          ) : null}

          {registering ? (
            <form className="credential-form" action="/api/auth/register" method="post">
              <input type="hidden" name="return_to" value={returnTo} />
              <label className="login-field">
                <span>Nome completo</span>
                <input
                  name="display_name"
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={180}
                  required
                />
              </label>
              <label className="login-field">
                <span>E-mail corporativo</span>
                <input
                  name="identifier"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={254}
                  required
                />
              </label>
              <label className="login-field">
                <span>Senha</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                />
                <small className="login-field-help">Use ao menos 12 caracteres.</small>
              </label>
              <label className="login-field">
                <span>Confirmar senha</span>
                <input
                  name="password_confirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={72}
                  required
                />
              </label>
              <button className="credential-submit" type="submit">
                <span>Enviar para aprovação</span>
                <ArrowRightIcon />
              </button>
            </form>
          ) : (
            <>
              <form className="credential-form" action="/api/auth/credentials/login" method="post">
                <input type="hidden" name="return_to" value={returnTo} />
                <label className="login-field">
                  <span>Usuário ou e-mail</span>
                  <input
                    name="login"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    minLength={3}
                    maxLength={254}
                    required
                  />
                </label>
                <label className="login-field">
                  <span>Senha</span>
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    maxLength={72}
                    required
                  />
                </label>
                <button className="credential-submit" type="submit">
                  <span>Entrar</span>
                  <ArrowRightIcon />
                </button>
              </form>

              <div className="provider-divider"><span>ou</span></div>

              <a className="provider-button provider-button-google" href={`/api/auth/google/login${query}`}>
                <GoogleIcon />
                <span>Continuar com Google</span>
                <ArrowRightIcon />
              </a>
            </>
          )}

          <div className="security-copy">
            <span className="security-icon" aria-hidden="true">
              <LockIcon />
            </span>
            <p>
              O acesso é limitado às contas liberadas pelo administrador. Senhas são
              verificadas pelo Supabase Auth e não ficam armazenadas no Patrimônio Ops.
            </p>
          </div>
          <nav className="login-legal" aria-label="Privacidade">
            <a href="/privacidade">Aviso de privacidade e direitos do titular</a>
            <a href="https://www.gazin.com.br/pagina/privacidade" rel="noreferrer">
              Política corporativa Gazin
            </a>
          </nav>
        </div>
      </section>
    </main>
  );
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function GoogleIcon() {
  return (
    <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.55h3.24c1.9-1.75 2.98-4.33 2.98-7.42Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.43l-3.24-2.54c-.9.6-2.05.97-3.39.97-2.61 0-4.82-1.76-5.61-4.13H3.05v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.87A6 6 0 0 1 6.08 12c0-.65.11-1.28.31-1.87V7.51H3.05A10 10 0 0 0 2 12c0 1.61.38 3.14 1.05 4.49l3.34-2.62Z" />
      <path fill="#EA4335" d="M12 6c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.95 5.51l3.34 2.62C7.18 7.76 9.39 6 12 6Z" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg className="provider-arrow" viewBox="0 0 20 20" aria-hidden="true">
      <path d="m7.5 4.5 5.5 5.5-5.5 5.5M13 10H3.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.75 8V6.25a3.25 3.25 0 0 1 6.5 0V8m-7.5 0h8.5A1.75 1.75 0 0 1 16 9.75v5.5A1.75 1.75 0 0 1 14.25 17h-8.5A1.75 1.75 0 0 1 4 15.25v-5.5A1.75 1.75 0 0 1 5.75 8Z" />
    </svg>
  );
}
