"use client";

import {
  type FormEvent,
  useMemo,
  useState,
} from "react";
import {
  importSpreadsheet,
  previewSpreadsheet,
} from "./api";
import type {
  Asset,
  Dashboard,
  ImportPreview,
  ModalState,
  MutationAction,
} from "./types";
import {
  AssetDetails,
  AssetIdentifier,
  AssetTypeIcon,
  EditIcon,
  EmptyState,
  FormError,
  Modal,
  ModalFooter,
  ModalHeader,
  SearchIcon,
  StatusBadge,
  formValue,
  normalizedText,
} from "./ui";

export function Dialogs({
  dashboard,
  modal,
  setModal,
  onMutate,
  onImported,
  onToast,
}: {
  dashboard: Dashboard;
  modal: ModalState;
  setModal: (modal: ModalState) => void;
  onMutate: (action: MutationAction, nextSelectedId?: string) => Promise<void>;
  onImported: () => Promise<void>;
  onToast: (message: string, error?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"summary" | "history">("summary");

  const close = () => setModal({ kind: "closed" });
  const execute = async (
    action: MutationAction,
    nextSelectedId?: string,
    afterSave: (() => void) | null = close,
  ) => {
    setError(null);
    setBusy(true);
    try {
      await onMutate(action, nextSelectedId);
      afterSave?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar a alteração.");
    } finally {
      setBusy(false);
    }
  };

  const selectedAsset = "assetId" in modal
    ? dashboard.nucleusInventory.find((asset) => asset.id === modal.assetId)
      ?? dashboard.inventory.find((asset) => asset.id === modal.assetId)
    : undefined;

  return (
    <>
      <CreateAssetDialog
        open={modal.kind === "create-asset"}
        dashboard={dashboard}
        busy={busy}
        error={error}
        onClose={close}
        onSubmit={(action, id) => execute(action, id)}
      />
      <TransferDialog
        open={modal.kind === "transfer"}
        asset={modal.kind === "transfer" ? selectedAsset : undefined}
        dashboard={dashboard}
        busy={busy}
        error={error}
        onClose={close}
        onSubmit={(action, id) => execute(action, id)}
      />
      <IdentifierDialog
        open={modal.kind === "identifier"}
        asset={modal.kind === "identifier" ? selectedAsset : undefined}
        busy={busy}
        error={error}
        onClose={close}
        onSubmit={(action, id) => execute(action, id)}
      />
      <NucleusDialog
        open={modal.kind === "create-nucleus"}
        busy={busy}
        error={error}
        onClose={close}
        onSubmit={(action) => execute(action)}
      />
      <EditNucleusDialog
        open={modal.kind === "edit-nucleus"}
        nucleus={modal.kind === "edit-nucleus"
          ? dashboard.nuclei.find((item) => item.id === modal.nucleusId)
          : undefined}
        busy={busy}
        error={error}
        onClose={close}
        onSubmit={(action) => execute(action)}
      />
      <NucleusInventoryDialog
        open={modal.kind === "nucleus-inventory"}
        dashboard={dashboard}
        nucleusId={modal.kind === "nucleus-inventory" ? modal.nucleusId : null}
        assetId={modal.kind === "nucleus-inventory" ? modal.assetId : undefined}
        busy={busy}
        error={error}
        onClose={close}
        onEditAsset={(nucleusId, assetId) => setModal({ kind: "nucleus-inventory", nucleusId, assetId })}
        onBack={(nucleusId) => setModal({ kind: "nucleus-inventory", nucleusId })}
        onSubmit={(action, nucleusId) => execute(
          action,
          undefined,
          () => setModal({ kind: "nucleus-inventory", nucleusId }),
        )}
      />
      <CollaboratorDialog
        open={modal.kind === "collaborator"}
        dashboard={dashboard}
        collaboratorId={modal.kind === "collaborator" ? modal.collaboratorId : null}
        busy={busy}
        error={error}
        onClose={close}
        onSubmit={(action) => execute(action)}
      />
      <ImportDialog
        open={modal.kind === "import"}
        revision={dashboard.revision}
        onClose={close}
        onImported={onImported}
        onToast={onToast}
      />
      <ScannerAssetDialog
        open={modal.kind === "scanner"}
        asset={modal.kind === "scanner" ? selectedAsset : undefined}
        dashboard={dashboard}
        busy={busy}
        error={error}
        detailTab={detailTab}
        onDetailTabChange={setDetailTab}
        onClose={close}
        onTransfer={(assetId) => setModal({ kind: "transfer", assetId })}
        onIdentifier={(assetId) => setModal({ kind: "identifier", assetId })}
        onStatusSubmit={(event, asset) => {
          event.preventDefault();
          const form = event.currentTarget;
          void execute({
            type: "update_status",
            assetId: asset.id,
            status: formValue(form, "status"),
            note: formValue(form, "note"),
          }, asset.id, null);
        }}
      />
    </>
  );
}

function CreateAssetDialog({
  open,
  dashboard,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  dashboard: Dashboard;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (action: MutationAction, id: string) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const id = formValue(form, "id");
    if (!/^\d{6}$/.test(id)) return;
    onSubmit({
      type: "create_asset",
      asset: {
        id,
        type: formValue(form, "type"),
        nucleusId: formValue(form, "nucleusId"),
        status: formValue(form, "status"),
        brandModel: formValue(form, "brandModel"),
        serial: formValue(form, "serial"),
        acquiredAt: formValue(form, "acquiredAt"),
        value: 0,
        assignee: formValue(form, "assignee"),
        location: formValue(form, "location"),
        notes: formValue(form, "notes"),
      },
    }, id);
  };

  return (
    <Modal open={open} labelledBy="asset-dialog-title" onClose={onClose}>
      <form className="modal-content" onSubmit={submit}>
        <ModalHeader eyebrow="Cadastro patrimonial" title="Novo patrimônio" titleId="asset-dialog-title" onClose={onClose} />
        <div className="modal-body form-grid">
          <label className="field">
            <span>Identificador de 6 números</span>
            <input name="id" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required placeholder="104296" />
          </label>
          <label className="field">
            <span>Tipo de item</span>
            <select name="type" required>
              {typedEntries(dashboard.options.assetTypes).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Núcleo</span>
            <select name="nucleusId" required>
              {dashboard.nuclei.map((nucleus) => (
                <option key={nucleus.id} value={nucleus.id}>{nucleus.code} - {nucleus.name}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select name="status" required>
              {typedEntries(dashboard.options.statuses).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="field field-wide">
            <span>Marca e modelo</span>
            <input name="brandModel" maxLength={180} required />
          </label>
          <label className="field">
            <span>Número de série</span>
            <input name="serial" maxLength={180} />
          </label>
          <label className="field">
            <span>Data de aquisição</span>
            <input name="acquiredAt" type="date" required />
          </label>
          <label className="field">
            <span>Responsável</span>
            <input name="assignee" maxLength={180} placeholder="Nome do colaborador" />
          </label>
          <label className="field field-wide">
            <span>Localização</span>
            <input name="location" maxLength={180} required placeholder="Sala, mesa ou unidade" />
          </label>
          <label className="field field-wide">
            <span>Observações</span>
            <textarea name="notes" maxLength={500} rows={3} />
          </label>
        </div>
        {error ? <FormError message={error} /> : null}
        <ModalFooter onCancel={onClose} submitLabel="Cadastrar patrimônio" busy={busy} />
      </form>
    </Modal>
  );
}

function TransferDialog({
  open,
  asset,
  dashboard,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  asset?: Asset;
  dashboard: Dashboard;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (action: MutationAction, id: string) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!asset) return;
    const form = event.currentTarget;
    onSubmit({
      type: "transfer_asset",
      assetId: asset.id,
      nucleusId: formValue(form, "nucleusId"),
      location: formValue(form, "location"),
      assignee: formValue(form, "assignee"),
      note: formValue(form, "note"),
    }, asset.id);
  };

  return (
    <Modal open={open} labelledBy="transfer-dialog-title" onClose={onClose}>
      <form className="modal-content modal-content-small" onSubmit={submit}>
        <ModalHeader eyebrow="Movimentação" title="Transferir patrimônio" titleId="transfer-dialog-title" onClose={onClose} />
        <div className="modal-body form-grid">
          <label className="field field-wide">
            <span>Novo núcleo</span>
            <select name="nucleusId" defaultValue={asset?.nucleusId} required>
              {dashboard.nuclei.map((nucleus) => (
                <option key={nucleus.id} value={nucleus.id}>{nucleus.code} - {nucleus.name}</option>
              ))}
            </select>
          </label>
          <label className="field field-wide">
            <span>Nova localização</span>
            <input name="location" maxLength={180} defaultValue={asset?.location} required />
          </label>
          <label className="field field-wide">
            <span>Novo responsável</span>
            <input name="assignee" maxLength={180} defaultValue={asset?.assignee} placeholder="Deixe vazio se ficar disponível" />
          </label>
          <label className="field field-wide">
            <span>Motivo</span>
            <textarea name="note" maxLength={500} rows={3} />
          </label>
        </div>
        {error ? <FormError message={error} /> : null}
        <ModalFooter onCancel={onClose} submitLabel="Confirmar transferência" busy={busy} />
      </form>
    </Modal>
  );
}

function IdentifierDialog({
  open,
  asset,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  asset?: Asset;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (action: MutationAction, id: string) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!asset) return;
    const form = event.currentTarget;
    const id = formValue(form, "newAssetId");
    if (!/^\d{6}$/.test(id)) return;
    onSubmit({
      type: "update_asset_identifier",
      assetId: asset.id,
      newAssetId: id,
      note: formValue(form, "note"),
    }, id);
  };

  return (
    <Modal open={open} labelledBy="identifier-dialog-title" onClose={onClose}>
      <form className="modal-content modal-content-small" onSubmit={submit}>
        <ModalHeader eyebrow="Identificação patrimonial" title="Alterar patrimônio" titleId="identifier-dialog-title" onClose={onClose} />
        <div className="modal-body form-grid">
          <label className="field field-wide">
            <span>Identificação atual</span>
            <input value={asset ? (asset.hasPatrimony ? asset.id : `Sem patrimônio · ${asset.id}`) : ""} readOnly />
          </label>
          <label className="field field-wide">
            <span>Novo patrimônio de 6 números</span>
            <input name="newAssetId" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
          </label>
          <p className="field-help field-wide">
            Núcleo, responsável, localização e histórico serão preservados.
          </p>
          <label className="field field-wide">
            <span>Motivo da alteração</span>
            <textarea name="note" maxLength={500} rows={3} required />
          </label>
        </div>
        {error ? <FormError message={error} /> : null}
        <ModalFooter onCancel={onClose} submitLabel="Salvar patrimônio" busy={busy} />
      </form>
    </Modal>
  );
}

function NucleusDialog({
  open,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (action: MutationAction) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    onSubmit({
      type: "create_nucleus",
      nucleus: {
        id: formValue(form, "id"),
        code: formValue(form, "code"),
        name: formValue(form, "name"),
        location: formValue(form, "location"),
        manager: formValue(form, "manager"),
      },
    });
  };
  return (
    <Modal open={open} labelledBy="nucleus-dialog-title" onClose={onClose}>
      <form className="modal-content modal-content-small" onSubmit={submit}>
        <ModalHeader eyebrow="Estrutura organizacional" title="Novo núcleo" titleId="nucleus-dialog-title" onClose={onClose} />
        <NucleusFields />
        {error ? <FormError message={error} /> : null}
        <ModalFooter onCancel={onClose} submitLabel="Criar núcleo" busy={busy} />
      </form>
    </Modal>
  );
}

function EditNucleusDialog({
  open,
  nucleus,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  nucleus?: Dashboard["nuclei"][number];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (action: MutationAction) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!nucleus) return;
    const form = event.currentTarget;
    onSubmit({
      type: "update_nucleus",
      nucleus: {
        id: nucleus.id,
        code: formValue(form, "code"),
        name: formValue(form, "name"),
        location: formValue(form, "location"),
        manager: formValue(form, "manager"),
      },
    });
  };
  return (
    <Modal open={open} labelledBy="edit-nucleus-dialog-title" onClose={onClose}>
      <form className="modal-content modal-content-small" onSubmit={submit}>
        <ModalHeader eyebrow="Estrutura organizacional" title="Editar núcleo" titleId="edit-nucleus-dialog-title" onClose={onClose} />
        <NucleusFields nucleus={nucleus} edit />
        {error ? <FormError message={error} /> : null}
        <ModalFooter onCancel={onClose} submitLabel="Salvar alterações" busy={busy} />
      </form>
    </Modal>
  );
}

function NucleusFields({
  nucleus,
  edit = false,
}: {
  nucleus?: Dashboard["nuclei"][number];
  edit?: boolean;
}) {
  return (
    <div className="modal-body form-grid">
      {!edit ? (
        <label className="field">
          <span>Identificador interno</span>
          <input name="id" maxLength={60} pattern="[a-z0-9-]+" required placeholder="nuc-juridico" />
        </label>
      ) : null}
      <label className="field">
        <span>Sigla</span>
        <input name="code" maxLength={12} defaultValue={nucleus?.code} required />
      </label>
      <label className="field field-wide">
        <span>Nome do núcleo</span>
        <input name="name" maxLength={180} defaultValue={nucleus?.name} required />
      </label>
      <label className="field field-wide">
        <span>Localização</span>
        <input name="location" maxLength={180} defaultValue={nucleus?.location} required />
      </label>
      <label className="field field-wide">
        <span>Gestor responsável</span>
        <input name="manager" maxLength={180} defaultValue={nucleus?.manager} required />
      </label>
    </div>
  );
}

function NucleusInventoryDialog({
  open,
  dashboard,
  nucleusId,
  assetId,
  busy,
  error,
  onClose,
  onEditAsset,
  onBack,
  onSubmit,
}: {
  open: boolean;
  dashboard: Dashboard;
  nucleusId: string | null;
  assetId?: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onEditAsset: (nucleusId: string, assetId: string) => void;
  onBack: (nucleusId: string) => void;
  onSubmit: (action: MutationAction, nucleusId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const nucleus = dashboard.nuclei.find((item) => item.id === nucleusId);
  const asset = dashboard.nucleusInventory.find((item) => item.id === assetId);
  const assets = useMemo(() => dashboard.nucleusInventory
    .filter((item) => item.nucleusId === nucleusId)
    .filter((item) => !query || normalizedText([
      item.id,
      dashboard.options.assetTypes[item.type],
      item.brandModel,
      item.serial,
      item.assignee,
      item.location,
      dashboard.options.statuses[item.status],
    ].join(" ")).includes(normalizedText(query)))
    .sort((left, right) => left.id.localeCompare(right.id)), [
      dashboard.nucleusInventory,
      dashboard.options,
      nucleusId,
      query,
    ]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!asset || !nucleusId) return;
    const form = event.currentTarget;
    onSubmit({
      type: "update_asset_details",
      assetId: asset.id,
      asset: {
        type: formValue(form, "type"),
        brandModel: formValue(form, "brandModel"),
        serial: formValue(form, "serial"),
        assignee: formValue(form, "assignee"),
        location: formValue(form, "location"),
        acquiredAt: formValue(form, "acquiredAt"),
        notes: formValue(form, "notes"),
      },
      note: formValue(form, "note"),
    }, nucleusId);
  };

  return (
    <Modal open={open} labelledBy="nucleus-inventory-title" className="nucleus-inventory-dialog" onClose={onClose}>
      <div className="modal-content nucleus-inventory-modal">
        <ModalHeader
          eyebrow="Inventário do núcleo"
          title={nucleus?.name ?? "Inventário"}
          titleId="nucleus-inventory-title"
          description={nucleus ? `${nucleus.location} · Gestor: ${nucleus.manager}` : undefined}
          onClose={onClose}
        >
          {nucleus ? <span className="nucleus-inventory-code" aria-hidden="true">{nucleus.code}</span> : null}
        </ModalHeader>
        {!asset ? (
          <section className="nucleus-inventory-list-view">
            <div className="nucleus-inventory-summary" aria-label="Resumo do inventário do núcleo">
              <div className="metric-total"><span>Total</span><strong>{nucleus?.total ?? 0}</strong><small>itens cadastrados</small></div>
              <div className="metric-allocated"><span>Em uso</span><strong>{nucleus?.allocated ?? 0}</strong><small>com responsável</small></div>
              <div className="metric-alert"><span>Alertas</span><strong>{nucleus?.alerts ?? 0}</strong><small>exigem conferência</small></div>
              <div className="metric-untagged"><span>Sem patrimônio</span><strong>{nucleus?.untagged ?? 0}</strong><small>aguardam etiqueta</small></div>
            </div>
            <div className="nucleus-inventory-toolbar">
              <div><h3>Itens do núcleo</h3><p>{assets.length} itens encontrados</p></div>
              <label className="field nucleus-inventory-search">
                <span>Buscar neste núcleo</span>
                <span className="nucleus-inventory-search-control">
                  <SearchIcon />
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Patrimônio, item, responsável ou local" />
                </span>
              </label>
            </div>
            {assets.length ? (
              <>
                <div className="nucleus-inventory-table-wrap">
                  <table className="nucleus-inventory-table">
                    <thead><tr><th>Patrimônio</th><th>Item</th><th>Responsável</th><th>Localização</th><th>Status</th><th><span className="sr-only">Ações</span></th></tr></thead>
                    <tbody>
                      {assets.map((item) => (
                        <tr key={item.id}>
                          <td><strong><AssetIdentifier asset={item} /></strong><span className="cell-secondary">{item.serial || "Série não informada"}</span></td>
                          <td>
                            <span className={`nucleus-inventory-item nucleus-inventory-item-${item.type}`}>
                              <span aria-hidden="true"><AssetTypeIcon type={item.type} /></span>
                              <span><strong>{dashboard.options.assetTypes[item.type]}</strong><small>{item.brandModel}</small></span>
                            </span>
                          </td>
                          <td>{item.assignee || "Disponível"}</td>
                          <td>{item.location}</td>
                          <td><StatusBadge status={item.status} labels={dashboard.options.statuses} /></td>
                          <td>
                            <button className="icon-button nucleus-asset-edit-button" type="button" title="Editar informações" aria-label={`Editar ${item.id}`} onClick={() => nucleusId && onEditAsset(nucleusId, item.id)}>
                              <EditIcon />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="nucleus-inventory-mobile">
                  {assets.map((item) => (
                    <article key={item.id} className={`nucleus-inventory-mobile-card nucleus-inventory-mobile-card-${item.type}`}>
                      <div className="nucleus-inventory-mobile-heading">
                        <span className={`profile-asset-icon profile-asset-icon-${item.type}`}><AssetTypeIcon type={item.type} /></span>
                        <div><strong><AssetIdentifier asset={item} /></strong><span>{dashboard.options.assetTypes[item.type]}</span></div>
                        <StatusBadge status={item.status} labels={dashboard.options.statuses} />
                      </div>
                      <dl>
                        <div><dt>Responsável</dt><dd>{item.assignee || "Disponível"}</dd></div>
                        <div><dt>Localização</dt><dd>{item.location}</dd></div>
                        <div><dt>Modelo</dt><dd>{item.brandModel}</dd></div>
                      </dl>
                      <button className="button button-secondary button-small" type="button" onClick={() => nucleusId && onEditAsset(nucleusId, item.id)}>Editar informações</button>
                    </article>
                  ))}
                </div>
              </>
            ) : <EmptyState title="Nenhum item encontrado" description="Revise a busca aplicada neste núcleo." />}
          </section>
        ) : (
          <form className="nucleus-asset-editor" onSubmit={submit}>
            <div className="nucleus-asset-editor-heading">
              <button className="button button-secondary button-small" type="button" onClick={() => nucleusId && onBack(nucleusId)}>← Voltar ao inventário</button>
              <div>
                <p className="eyebrow">Edição cadastral auditável</p>
                <h3>Editar <AssetIdentifier asset={asset} /></h3>
                <p>Núcleo, status e patrimônio possuem fluxos próprios para preservar a auditoria.</p>
              </div>
            </div>
            <div className="nucleus-asset-editor-body form-grid">
              <label className="field"><span>Patrimônio</span><input value={asset.id} readOnly /></label>
              <label className="field"><span>Núcleo</span><input value={asset.nucleus.name} readOnly /></label>
              <label className="field">
                <span>Tipo de item</span>
                <select name="type" defaultValue={asset.type} required>
                  {typedEntries(dashboard.options.assetTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="field"><span>Número de série</span><input name="serial" maxLength={180} defaultValue={asset.serial} /></label>
              <label className="field field-wide"><span>Marca e modelo</span><input name="brandModel" maxLength={180} defaultValue={asset.brandModel} required /></label>
              <label className="field"><span>Responsável</span><input name="assignee" maxLength={180} defaultValue={asset.assignee} /></label>
              <label className="field"><span>Data de aquisição</span><input name="acquiredAt" type="date" defaultValue={asset.acquiredAt ?? ""} /></label>
              <label className="field field-wide"><span>Localização</span><input name="location" maxLength={180} defaultValue={asset.location} required /></label>
              <label className="field field-wide"><span>Observações</span><textarea name="notes" maxLength={500} rows={3} defaultValue={asset.notes} /></label>
              <label className="field field-wide"><span>Motivo da alteração</span><textarea name="note" maxLength={500} rows={3} required /></label>
            </div>
            {error ? <FormError message={error} /> : null}
            <ModalFooter onCancel={() => nucleusId && onBack(nucleusId)} submitLabel="Salvar informações" busy={busy} />
          </form>
        )}
      </div>
    </Modal>
  );
}

function CollaboratorDialog({
  open,
  dashboard,
  collaboratorId,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  dashboard: Dashboard;
  collaboratorId: string | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (action: MutationAction) => void;
}) {
  const collaborator = dashboard.collaborators.find((item) => item.id === collaboratorId);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!collaborator) return;
    const form = event.currentTarget;
    const payload = {
      id: collaborator.id,
      previousName: collaborator.name,
      name: formValue(form, "name"),
      nucleusId: formValue(form, "nucleusId"),
    };
    onSubmit({
      type: collaborator.profileRegistered ? "update_collaborator" : "register_responsible",
      [collaborator.profileRegistered ? "collaborator" : "responsible"]: payload,
    });
  };
  return (
    <Modal open={open} labelledBy="collaborator-dialog-title" className="profile-modal" onClose={onClose}>
      <form className="modal-content profile-modal-content" onSubmit={submit}>
        <div className="modal-header profile-modal-header">
          <div className="profile-identity">
            <span className="profile-avatar" aria-hidden="true">{collaborator?.name.charAt(0).toUpperCase() ?? "C"}</span>
            <div><p className="eyebrow">Perfil do colaborador</p><h2 id="collaborator-dialog-title">{collaborator?.name ?? "Colaborador"}</h2><p>{collaborator?.nucleus.name}</p></div>
          </div>
          <button className="icon-button" type="button" aria-label="Fechar" onClick={onClose}>×</button>
        </div>
        <div className="modal-body profile-modal-body">
          <section className="profile-editor">
            <div className="profile-section-heading"><h3>Informações do perfil</h3><span>{collaborator?.profileRegistered ? "Perfil cadastrado" : "Responsável encontrado no inventário"}</span></div>
            <div className="form-grid">
              <label className="field field-wide"><span>Nome do colaborador</span><input name="name" maxLength={180} defaultValue={collaborator?.name} required /></label>
              <label className="field field-wide">
                <span>Núcleo</span>
                <select name="nucleusId" defaultValue={collaborator?.nucleusId} required>
                  {dashboard.nuclei.map((nucleus) => <option key={nucleus.id} value={nucleus.id}>{nucleus.code} - {nucleus.name}</option>)}
                </select>
              </label>
            </div>
          </section>
          <section className="profile-assets">
            <div className="profile-section-heading"><h3>Patrimônios vinculados</h3><span>{collaborator?.assets.length ?? 0} itens</span></div>
            <div className="profile-assets-list">
              {collaborator?.assets.map((asset) => (
                <article className="profile-asset-item" key={asset.id}>
                  <span className={`profile-asset-icon profile-asset-icon-${asset.type}`}><AssetTypeIcon type={asset.type} /></span>
                  <div className="profile-asset-heading"><strong><AssetIdentifier asset={asset} /> · {dashboard.options.assetTypes[asset.type]}</strong><span>{asset.brandModel || "Modelo não informado"}</span></div>
                  <StatusBadge status={asset.status} labels={dashboard.options.statuses} />
                </article>
              ))}
            </div>
          </section>
        </div>
        {error ? <FormError message={error} /> : null}
        <ModalFooter onCancel={onClose} submitLabel={collaborator?.profileRegistered ? "Salvar perfil" : "Cadastrar perfil"} busy={busy} />
      </form>
    </Modal>
  );
}

function ImportDialog({
  open,
  revision,
  onClose,
  onImported,
  onToast,
}: {
  open: boolean;
  revision: number;
  onClose: () => void;
  onImported: () => Promise<void>;
  onToast: (message: string, error?: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlePreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setPreview(await previewSpreadsheet(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível validar a planilha.");
    } finally {
      setBusy(false);
    }
  };
  const handleImport = async () => {
    if (!file || !preview?.canCommit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importSpreadsheet(file, revision);
      await onImported();
      onClose();
      onToast(result.message || "Planilha importada com sucesso.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível importar a planilha.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} labelledBy="import-dialog-title" onClose={onClose}>
      <form className="modal-content import-modal" onSubmit={handlePreview}>
        <ModalHeader eyebrow="Carga controlada" title="Importar planilha XLSX" titleId="import-dialog-title" onClose={onClose} />
        <div className="modal-body import-body">
          <label className="file-field">
            <strong>Selecione a planilha de patrimônios</strong>
            <span>Layout original ou arquivo exportado pelo sistema, com até 2 MB.</span>
            <input
              name="file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setError(null);
              }}
            />
          </label>
          {preview ? (
            <section className="import-preview" aria-live="polite">
              <div className="preview-metrics preview-metrics-six">
                <div><span>Válidos</span><strong>{preview.acceptedCount}</strong></div>
                <div><span>Sem patrimônio</span><strong>{preview.untaggedCount}</strong></div>
                <div><span>Excluídos</span><strong>{preview.rejectedCount}</strong></div>
                <div><span>Ajustados</span><strong>{preview.adjustedCount}</strong></div>
                <div><span>Núcleos</span><strong>{preview.nucleusCount}</strong></div>
                <div><span>Colaboradores</span><strong>{preview.collaboratorCount}</strong></div>
              </div>
              <div className="preview-issues">
                {[...preview.errors, ...preview.warnings].slice(0, 12).map((issue, index) => (
                  <p key={`${issue.row}-${issue.column}-${index}`}>Linha {issue.row} · {issue.column}: {issue.message}</p>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        {error ? <FormError message={error} /> : null}
        <div className="modal-footer">
          <button className="button button-secondary" type="button" onClick={onClose}>Cancelar</button>
          <button className="button button-secondary" type="submit" disabled={busy || !file}>{busy ? "Validando..." : "Pré-validar"}</button>
          <button className="button button-primary" type="button" disabled={busy || !preview?.canCommit} onClick={() => void handleImport()}>Importar válidos</button>
        </div>
      </form>
    </Modal>
  );
}

function ScannerAssetDialog({
  open,
  asset,
  dashboard,
  busy,
  error,
  detailTab,
  onDetailTabChange,
  onClose,
  onTransfer,
  onIdentifier,
  onStatusSubmit,
}: {
  open: boolean;
  asset?: Asset;
  dashboard: Dashboard;
  busy: boolean;
  error: string | null;
  detailTab: "summary" | "history";
  onDetailTabChange: (tab: "summary" | "history") => void;
  onClose: () => void;
  onTransfer: (assetId: string) => void;
  onIdentifier: (assetId: string) => void;
  onStatusSubmit: (event: FormEvent<HTMLFormElement>, asset: Asset) => void;
}) {
  return (
    <Modal open={open} labelledBy="scanner-asset-title" className="scanner-asset-modal" onClose={onClose}>
      <div className="modal-content scanner-asset-modal-content">
        <ModalHeader eyebrow="Conferência por leitura" title="Patrimônio localizado" titleId="scanner-asset-title" onClose={onClose} />
        {asset ? (
          <AssetDetails
            asset={asset}
            dashboard={dashboard}
            authenticated={dashboard.session.authenticated}
            activeTab={detailTab}
            onTabChange={onDetailTabChange}
            onTransfer={() => onTransfer(asset.id)}
            onIdentifier={() => onIdentifier(asset.id)}
            onStatusSubmit={(event) => onStatusSubmit(event, asset)}
            busy={busy}
            error={error}
            scannerContext
          />
        ) : (
          <EmptyState title="Patrimônio não encontrado" description="Faça uma nova leitura no inventário." />
        )}
      </div>
    </Modal>
  );
}

function typedEntries<T extends string>(value: Record<T, string>): Array<[T, string]> {
  return Object.entries(value) as Array<[T, string]>;
}
