import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Entrar | Patrimônio Ops",
  description: "Acesso autorizado ao controle patrimonial.",
};

const messages: Record<string, string> = {
  github_not_configured: "O acesso com GitHub ainda não foi configurado pelo administrador.",
  github_login_failed: "Não foi possível concluir o acesso com GitHub.",
  github_not_authorized: "Esta conta GitHub não possui permissão para acessar a base.",
  google_not_configured: "O acesso com Google ainda não foi configurado pelo administrador.",
  google_login_failed: "Não foi possível concluir o acesso com Google.",
  google_not_authorized: "Este e-mail Google não possui permissão para acessar a base.",
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
  const query = `?return_to=${encodeURIComponent(returnTo)}`;

  return (
    <main className="login-shell">
        <section className="brand-panel" aria-labelledby="brand-title">
          <a className="brand" href="/demo" aria-label="Patrimônio Ops - voltar ao sistema">
            <span className="brand-mark" aria-hidden="true">PO</span>
            <span><strong>Patrimônio Ops</strong><small>Controle empresarial</small></span>
          </a>
          <div className="brand-copy">
            <p className="eyebrow">Base operacional protegida</p>
            <h1 id="brand-title">Acesso ao controle de patrimônios</h1>
            <p>Identidade verificada e alterações registradas na auditoria da empresa.</p>
          </div>
          <div className="trust-note">
            <span className="status-dot" aria-hidden="true" />
            <span>Os dados importados da planilha permanecem restritos.</span>
          </div>
        </section>
        <section className="access-panel" aria-labelledby="login-title">
          <div className="access-content">
            <p className="eyebrow">Identificação</p>
            <h2 id="login-title">Acessar Patrimônio Ops</h2>
            <p className="access-description">Escolha uma conta autorizada para continuar.</p>
            {message ? <div className="error-message" role="alert">{message}</div> : null}
            <div className="provider-list" aria-label="Opções de acesso">
              <a className="provider-button provider-github" href={`/api/auth/github/login${query}`}>
                <span className="github-mark" aria-hidden="true">GH</span>
                <span>Continuar com GitHub</span>
                <span className="provider-arrow" aria-hidden="true">→</span>
              </a>
              <a className="provider-button" href={`/api/auth/google/login${query}`}>
                <span className="google-mark" aria-hidden="true">G</span>
                <span>Continuar com Google</span>
                <span className="provider-arrow" aria-hidden="true">→</span>
              </a>
            </div>
            <p className="security-copy">
              O acesso é limitado às contas liberadas pelo administrador. Nenhuma senha é enviada ao Patrimônio Ops.
            </p>
            <a className="back-link" href="/demo">← Voltar ao sistema</a>
          </div>
        </section>
    </main>
  );
}

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
