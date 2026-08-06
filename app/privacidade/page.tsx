import type { Metadata } from "next";
import "./privacy.css";

export const metadata: Metadata = {
  title: "Privacidade | Patrimônio Ops",
  description: "Informações sobre o tratamento de dados pessoais no Patrimônio Ops.",
};

const GAZIN_PRIVACY_URL = "https://www.gazin.com.br/pagina/privacidade";
const GAZIN_RETENTION_URL = "https://www.gazin.com.br/pagina/politica-retencao-dados";

export default function PrivacyPage() {
  return (
    <main className="privacy-shell">
      <article className="privacy-document">
        <header className="privacy-header">
          <a className="privacy-brand" href="/login" aria-label="Voltar para o login">
            <img src="/brand/cx-mark-header.png" alt="" width={440} height={230} />
            <span><strong>Patrimônio Ops</strong><small>Privacidade e proteção de dados</small></span>
          </a>
          <div>
            <p className="privacy-eyebrow">Aviso de privacidade interno</p>
            <h1>Como seus dados são tratados</h1>
            <p>
              Este aviso descreve o uso de dados pessoais no controle patrimonial dos
              departamentos autorizados do Grupo Gazin.
            </p>
          </div>
          <dl className="privacy-version">
            <div><dt>Versão</dt><dd>1.1</dd></div>
            <div><dt>Atualização</dt><dd>31/07/2026</dd></div>
            <div><dt>Classificação</dt><dd>Uso interno</dd></div>
          </dl>
        </header>

        <div className="privacy-content">
          <section>
            <h2>1. Controlador e encarregado</h2>
            <p>
              O controlador é a empresa do Grupo Gazin responsável pelo vínculo do
              colaborador e pelo departamento que concedeu o acesso. A política pública
              identifica a Gazin Indústria e Comércio de Móveis e Eletrodomésticos Ltda.,
              CNPJ 77.941.490/0001-55, e o encarregado Sr. Celso Yokota.
            </p>
            <p>
              O canal eletrônico e o endereço para solicitações estão na{" "}
              <a href={GAZIN_PRIVACY_URL} rel="noreferrer">Política de Privacidade da Gazin</a>.
            </p>
          </section>

          <section>
            <h2>2. Dados tratados</h2>
            <ul>
              <li>nome, código interno, departamento, núcleo e localização de trabalho;</li>
              <li>e-mail autorizado, nome de usuário e nome exibido no acesso;</li>
              <li>vínculo entre colaborador, patrimônio, série, modelo, status e observações;</li>
              <li>custódia, manutenção, conferências, localizações observadas e processos de desligamento;</li>
              <li>documentos, garantias, contratos, fotos e laudos vinculados ao patrimônio;</li>
              <li>histórico de movimentações, importações, exportações e alterações de acesso;</li>
              <li>datas, horários e registros técnicos necessários à segurança da aplicação.</li>
            </ul>
            <p>
              A aplicação não foi projetada para registrar saúde, biometria, opinião política,
              religião ou outras categorias de dados pessoais sensíveis. Esses dados não devem
              ser inseridos em observações ou planilhas.
            </p>
          </section>

          <section>
            <h2>3. Finalidades e bases legais</h2>
            <p>Os dados são utilizados para:</p>
            <ul>
              <li>identificar responsáveis e localizar ativos empresariais;</li>
              <li>controlar acesso por departamento e prevenir uso não autorizado;</li>
              <li>manter rastreabilidade, auditoria e segurança patrimonial;</li>
              <li>atender obrigações legais, regulatórias, contratuais e exercício de direitos.</li>
            </ul>
            <p>
              O tratamento se apoia no legítimo interesse de gestão e segurança patrimonial,
              na execução das relações de trabalho e contratos e, quando aplicável, no
              cumprimento de obrigação legal ou regulatória. O sistema não utiliza consentimento
              como condição para a rotina patrimonial.
            </p>
          </section>

          <section>
            <h2>4. Compartilhamento e transferência internacional</h2>
            <p>
              O acesso é limitado a usuários e administradores autorizados. A operação utiliza
              Google e Supabase Auth para autenticação, Cloudflare para execução e entrega
              da aplicação e Supabase para banco de dados e funções de servidor.
            </p>
            <p>
              Esses fornecedores podem tratar ou armazenar dados fora do Brasil. O Grupo Gazin
              deve manter contratos, medidas de segurança e mecanismo válido de transferência
              internacional conforme a LGPD e a Resolução ANPD nº 19/2024.
            </p>
          </section>

          <section>
            <h2>5. Retenção e eliminação</h2>
            <p>
              Registros técnicos temporários são eliminados automaticamente após o prazo
              configurado. Eventos de login permanecem por até 180 dias; eventos de acesso,
              importação e exportação, por até cinco anos, salvo obrigação de preservação.
            </p>
            <p>
              Durante uma conferência sem internet, o dispositivo pode manter por até 30 dias
              uma fila mínima com departamento, campanha, patrimônio, resultado, local,
              observação e horário. A fila é removida após a sincronização e não contém nome,
              e-mail, série, modelo, documento ou credencial.
            </p>
            <p>
              O prazo dos registros patrimoniais depende da finalidade, de obrigações legais e
              da política corporativa. A exclusão não deve ocorrer quando os dados ainda forem
              necessários para auditoria, defesa de direitos ou obrigação regulatória. Consulte a{" "}
              <a href={GAZIN_RETENTION_URL} rel="noreferrer">Política de Retenção de Dados do Grupo Gazin</a>.
            </p>
          </section>

          <section>
            <h2>6. Seus direitos</h2>
            <p>
              O titular pode solicitar confirmação e acesso, correção, informação sobre
              compartilhamentos, anonimização, bloqueio ou eliminação de dados excessivos,
              oposição quando cabível e revisão do tratamento.
            </p>
            <p>
              A solicitação deve ser enviada ao encarregado pelo canal publicado na política
              oficial. A identidade poderá ser validada antes da entrega de informações.
            </p>
          </section>

          <section>
            <h2>7. Segurança e responsabilidades</h2>
            <ul>
              <li>cada usuário visualiza somente departamentos liberados;</li>
              <li>alteração, importação e exportação exigem permissões independentes;</li>
              <li>mudanças administrativas, logins e exportações são auditados;</li>
              <li>documentos usam armazenamento privado e acesso temporário autorizado;</li>
              <li>senhas Google não são recebidas; senhas internas são verificadas e armazenadas com hash exclusivamente pelo Supabase Auth.</li>
            </ul>
            <p>
              Não compartilhe exportações, não inclua dados sensíveis em campos livres e comunique
              imediatamente qualquer acesso indevido ao gestor, à Segurança da Informação e ao
              encarregado.
            </p>
          </section>
        </div>

        <footer className="privacy-actions">
          <a className="privacy-primary-action" href="/login">Voltar para o login</a>
          <a href={GAZIN_PRIVACY_URL} rel="noreferrer">Abrir política corporativa</a>
        </footer>
      </article>
    </main>
  );
}
