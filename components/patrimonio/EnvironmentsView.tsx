"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fetchDepartmentNuclei,
  saveDepartmentUser,
  transferDepartment,
} from "./api";
import type {
  Dashboard,
  DepartmentUser,
} from "./types";
import {
  EmptyState,
  FormError,
  formatDateTime,
  formValue,
} from "./ui";

type TargetDepartment = Awaited<ReturnType<typeof fetchDepartmentNuclei>>;

const emptyUser: DepartmentUser = {
  identifier: "",
  displayName: "",
  isAdmin: false,
  active: true,
  departmentSlugs: [],
};

export function EnvironmentsView({
  dashboard,
  onRefresh,
  onSwitchDepartment,
  onToast,
}: {
  dashboard: Dashboard;
  onRefresh: () => Promise<void>;
  onSwitchDepartment: (slug: string) => void;
  onToast: (message: string, error?: boolean) => void;
}) {
  const environment = dashboard.environment;
  const [accessForm, setAccessForm] = useState<DepartmentUser>(emptyUser);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const targetOptions = useMemo(
    () => environment.departments.filter(
      (department) => department.slug !== environment.activeDepartment.slug,
    ),
    [environment.activeDepartment.slug, environment.departments],
  );
  const [targetSlug, setTargetSlug] = useState(targetOptions[0]?.slug ?? "");
  const effectiveTargetSlug = targetOptions.some(
    (department) => department.slug === targetSlug,
  )
    ? targetSlug
    : targetOptions[0]?.slug ?? "";
  const [targetData, setTargetData] = useState<TargetDepartment | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<"asset" | "collaborator">("asset");

  useEffect(() => {
    if (!effectiveTargetSlug) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setTargetLoading(true);
      setTransferError(null);
      fetchDepartmentNuclei(effectiveTargetSlug)
        .then((result) => {
          if (!controller.signal.aborted) setTargetData(result);
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setTargetData(null);
            setTransferError(
              cause instanceof Error
                ? cause.message
                : "Não foi possível carregar o departamento de destino.",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setTargetLoading(false);
        });
    }, 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [effectiveTargetSlug]);

  const entities = useMemo(() => (
    entityType === "asset"
      ? dashboard.inventory.map((asset) => ({
        id: asset.id,
        label: `${asset.hasPatrimony ? `#${asset.id}` : asset.id} · ${asset.brandModel}`,
      }))
      : dashboard.collaborators.map((collaborator) => ({
        id: collaborator.id,
        label: `${collaborator.name} · ${collaborator.assetCount} itens`,
      }))
  ), [dashboard.collaborators, dashboard.inventory, entityType]);

  const editUser = (user: DepartmentUser) => {
    setAccessError(null);
    setAccessForm({
      ...user,
      departmentSlugs: [...user.departmentSlugs],
    });
  };

  const toggleDepartment = (slug: string, checked: boolean) => {
    setAccessForm((current) => ({
      ...current,
      departmentSlugs: checked
        ? [...new Set([...current.departmentSlugs, slug])]
        : current.departmentSlugs.filter((departmentSlug) => departmentSlug !== slug),
    }));
  };

  const submitAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAccessBusy(true);
    setAccessError(null);
    try {
      const result = await saveDepartmentUser(accessForm);
      await onRefresh();
      setAccessForm(emptyUser);
      onToast(result.message);
    } catch (cause) {
      setAccessError(
        cause instanceof Error ? cause.message : "Não foi possível atualizar o acesso.",
      );
    } finally {
      setAccessBusy(false);
    }
  };

  const submitTransfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!targetData) return;
    const form = event.currentTarget;
    setTransferBusy(true);
    setTransferError(null);
    try {
      const entityId = formValue(form, "entityId");
      const selectedCollaborator = dashboard.collaborators.find(
        (collaborator) => collaborator.id === entityId,
      );
      const result = await transferDepartment({
        sourceDepartmentSlug: environment.activeDepartment.slug,
        targetDepartmentSlug: targetData.department.slug,
        expectedSourceRevision: dashboard.revision,
        expectedTargetRevision: targetData.revision,
        entityType,
        entityId,
        targetNucleusId: formValue(form, "targetNucleusId"),
        targetLocation: formValue(form, "targetLocation"),
        targetAssignee: entityType === "collaborator"
          ? selectedCollaborator?.name ?? ""
          : formValue(form, "targetAssignee"),
        note: formValue(form, "note"),
      });
      await onRefresh();
      form.reset();
      onToast(result.message);
    } catch (cause) {
      setTransferError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir a transferência.",
      );
    } finally {
      setTransferBusy(false);
    }
  };

  return (
    <section className="view-section environments-view" id="environments-view">
      <div className="environment-grid">
        {environment.departments.map((department) => {
          const active = department.slug === environment.activeDepartment.slug;
          return (
            <article className={`environment-card ${active ? "is-active" : ""}`} key={department.slug}>
              <div>
                <span className="environment-card-kicker">{active ? "Ambiente atual" : "Departamento"}</span>
                <h2>{department.name}</h2>
                <p>
                  {active
                    ? `${dashboard.nuclei.length} núcleos · ${dashboard.collaborators.length} colaboradores`
                    : "Dados isolados e acesso controlado por usuário."}
                </p>
              </div>
              {active ? (
                <span className="environment-active-badge">Em uso</span>
              ) : (
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => onSwitchDepartment(department.slug)}
                >
                  Abrir ambiente
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className="environment-admin-layout">
        <section className="operational-panel environment-access-panel" aria-labelledby="access-title">
          <div className="operational-panel-toolbar">
            <div>
              <h2 id="access-title">Acesso por usuário</h2>
              <p>Administradores veem todos os ambientes; demais usuários veem apenas os departamentos marcados.</p>
            </div>
            <span className="record-count">{environment.users.length} usuários</span>
          </div>

          <form className="environment-access-form form-grid" onSubmit={submitAccess}>
            <label className="field">
              <span>E-mail Google</span>
              <input
                type="email"
                value={accessForm.identifier}
                onChange={(event) => setAccessForm((current) => ({
                  ...current,
                  identifier: event.target.value.toLowerCase(),
                }))}
                readOnly={environment.users.some(
                  (user) => user.identifier === accessForm.identifier,
                )}
                required
              />
            </label>
            <label className="field">
              <span>Nome de exibição</span>
              <input
                value={accessForm.displayName}
                maxLength={180}
                onChange={(event) => setAccessForm((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))}
              />
            </label>
            <label className="environment-admin-check field-wide">
              <input
                type="checkbox"
                checked={accessForm.isAdmin}
                onChange={(event) => setAccessForm((current) => ({
                  ...current,
                  isAdmin: event.target.checked,
                }))}
              />
              <span><strong>Administrador global</strong><small>Acesso a todos os departamentos e transferências.</small></span>
            </label>
            <fieldset className="environment-memberships field-wide">
              <legend>Departamentos liberados</legend>
              {environment.departments.map((department) => (
                <label key={department.slug}>
                  <input
                    type="checkbox"
                    checked={accessForm.departmentSlugs.includes(department.slug)}
                    disabled={accessForm.isAdmin}
                    onChange={(event) => toggleDepartment(department.slug, event.target.checked)}
                  />
                  <span>{department.name}</span>
                </label>
              ))}
            </fieldset>
            {accessError ? <FormError message={accessError} /> : null}
            <div className="environment-form-actions field-wide">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setAccessForm(emptyUser)}
              >
                Limpar
              </button>
              <button className="button button-primary" type="submit" disabled={accessBusy}>
                {accessBusy ? "Salvando..." : "Salvar acesso"}
              </button>
            </div>
          </form>

          <div className="environment-user-list">
            {environment.users.map((user) => (
              <article key={user.identifier}>
                <div>
                  <strong>{user.displayName || user.identifier}</strong>
                  <span>{user.identifier}</span>
                </div>
                <div className="environment-user-tags">
                  {user.isAdmin
                    ? <span>Administrador</span>
                    : user.departmentSlugs.map((slug) => (
                      <span key={slug}>
                        {environment.departments.find((department) => department.slug === slug)?.name ?? slug}
                      </span>
                    ))}
                </div>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => editUser(user)}
                >
                  Editar
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="operational-panel environment-transfer-panel" aria-labelledby="department-transfer-title">
          <div className="operational-panel-toolbar">
            <div>
              <h2 id="department-transfer-title">Transferir entre departamentos</h2>
              <p>A operação preserva o histórico e registra origem, destino, responsável e justificativa.</p>
            </div>
          </div>

          {targetOptions.length ? (
            <form className="form-grid environment-transfer-form" onSubmit={submitTransfer}>
              <label className="field">
                <span>Tipo de registro</span>
                <select
                  value={entityType}
                  onChange={(event) => setEntityType(
                    event.target.value === "collaborator" ? "collaborator" : "asset",
                  )}
                >
                  <option value="asset">Patrimônio</option>
                  <option value="collaborator">Colaborador e seus itens</option>
                </select>
              </label>
              <label className="field">
                <span>Registro de origem</span>
                <select name="entityId" required>
                  <option value="">Selecione</option>
                  {entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>{entity.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Departamento de destino</span>
                <select value={effectiveTargetSlug} onChange={(event) => setTargetSlug(event.target.value)}>
                  {targetOptions.map((department) => (
                    <option key={department.slug} value={department.slug}>{department.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Núcleo de destino</span>
                <select name="targetNucleusId" disabled={targetLoading || !targetData?.nuclei.length} required>
                  <option value="">
                    {targetLoading ? "Carregando..." : "Selecione"}
                  </option>
                  {targetData?.nuclei.map((nucleus) => (
                    <option key={nucleus.id} value={nucleus.id}>
                      {nucleus.code} - {nucleus.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Localização no destino</span>
                <input name="targetLocation" maxLength={180} required />
              </label>
              {entityType === "asset" ? (
                <label className="field">
                  <span>Responsável no destino</span>
                  <input name="targetAssignee" maxLength={180} />
                </label>
              ) : (
                <p className="field-help field-wide">
                  Todos os patrimônios atualmente vinculados ao colaborador serão transferidos com ele.
                </p>
              )}
              <label className="field field-wide">
                <span>Motivo da transferência</span>
                <textarea name="note" maxLength={500} rows={3} required />
              </label>
              {!targetLoading && targetData && !targetData.nuclei.length ? (
                <p className="environment-warning field-wide">
                  Crie pelo menos um núcleo em {targetData.department.name} antes de transferir registros.
                </p>
              ) : null}
              {transferError ? <FormError message={transferError} /> : null}
              <div className="environment-form-actions field-wide">
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={transferBusy || targetLoading || !targetData?.nuclei.length || !entities.length}
                >
                  {transferBusy ? "Transferindo..." : "Confirmar transferência"}
                </button>
              </div>
            </form>
          ) : (
            <EmptyState
              title="Nenhum departamento de destino"
              description="Cadastre outro ambiente para habilitar transferências."
            />
          )}
        </section>
      </div>

      <section className="operational-panel environment-history" aria-labelledby="environment-history-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="environment-history-title">Histórico entre departamentos</h2>
            <p>Transferências que tiveram o ambiente atual como origem ou destino.</p>
          </div>
          <span className="record-count">{environment.transfers.length} registros</span>
        </div>
        {environment.transfers.length ? (
          <div className="environment-transfer-history">
            {environment.transfers.map((transfer) => (
              <article key={transfer.id}>
                <div>
                  <span>{transfer.entityType === "asset" ? "Patrimônio" : "Colaborador"}</span>
                  <strong>{transfer.entityLabel}</strong>
                  <small>{transfer.assetCodes.length} patrimônios envolvidos</small>
                </div>
                <p>
                  <strong>{transfer.sourceDepartmentName}</strong>
                  <span aria-hidden="true">→</span>
                  <strong>{transfer.targetDepartmentName}</strong>
                </p>
                <div>
                  <span>{formatDateTime(transfer.at)}</span>
                  <small>{transfer.note}</small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhuma transferência entre departamentos"
            description="As movimentações administrativas aparecerão aqui."
          />
        )}
      </section>
    </section>
  );
}
