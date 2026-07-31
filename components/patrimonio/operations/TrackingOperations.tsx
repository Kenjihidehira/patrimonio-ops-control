"use client";

import { type FormEvent, useState } from "react";
import { EmptyState, formValue, formatDateTime } from "../ui";
import type { TrackingEventTechnology, TrackingTechnology } from "../types";
import {
  AssetSelect,
  FormActions,
  InlineError,
  StatusPill,
  assetById,
  assetLabel,
  type OperationProps,
} from "./shared";

const technologyLabels: Record<TrackingEventTechnology, string> = {
  qr: "QR Code",
  barcode: "Código de barras",
  rfid_uhf: "RFID UHF",
  ble: "Bluetooth BLE",
  uwb: "UWB",
  gps: "GPS",
  mdm: "MDM",
  manual: "Registro manual",
};

export function TrackingOperations({ dashboard, onMutate }: OperationProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function assignTag(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusyKey("tag");
    setError(null);
    try {
      await onMutate({
        type: "assign_tracking_tag",
        tag: {
          id: crypto.randomUUID(),
          assetId: formValue(form, "assetId"),
          technology: formValue(form, "technology"),
          tagId: formValue(form, "tagId"),
        },
      });
      form.reset();
    } catch (cause) {
      setError(messageFrom(cause, "Não foi possível vincular o identificador."));
    } finally {
      setBusyKey(null);
    }
  }

  async function recordEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusyKey("event");
    setError(null);
    try {
      await onMutate({
        type: "record_tracking_event",
        event: {
          id: crypto.randomUUID(),
          assetId: formValue(form, "assetId"),
          technology: formValue(form, "technology"),
          tagId: formValue(form, "tagId"),
          readerId: formValue(form, "readerId"),
          location: formValue(form, "location"),
          latitude: formValue(form, "latitude"),
          longitude: formValue(form, "longitude"),
          accuracyMeters: formValue(form, "accuracyMeters"),
          confidence: formValue(form, "confidence"),
          batteryPercent: formValue(form, "batteryPercent"),
          note: formValue(form, "note"),
        },
      });
      form.reset();
    } catch (cause) {
      setError(messageFrom(cause, "Não foi possível registrar a leitura."));
    } finally {
      setBusyKey(null);
    }
  }

  function fillCurrentLocation(form: HTMLFormElement) {
    if (!navigator.geolocation) {
      setError("A geolocalização não está disponível neste navegador.");
      return;
    }
    setBusyKey("location");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = form.elements.namedItem("latitude") as HTMLInputElement | null;
        const longitude = form.elements.namedItem("longitude") as HTMLInputElement | null;
        const accuracy = form.elements.namedItem("accuracyMeters") as HTMLInputElement | null;
        if (latitude) latitude.value = String(position.coords.latitude);
        if (longitude) longitude.value = String(position.coords.longitude);
        if (accuracy) accuracy.value = String(Math.round(position.coords.accuracy));
        setBusyKey(null);
      },
      () => {
        setError("Não foi possível obter a posição atual. Verifique a permissão do navegador.");
        setBusyKey(null);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  }

  return (
    <div className="tracking-layout">
      <section className="operational-panel operation-form-panel" aria-labelledby="tracking-tag-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="tracking-tag-title">Vincular chip ou etiqueta</h2>
            <p>Associe identificadores físicos e digitais ao patrimônio.</p>
          </div>
        </div>
        <form className="form-grid operation-form" onSubmit={assignTag}>
          <label className="field field-wide"><span>Patrimônio</span><AssetSelect assets={dashboard.nucleusInventory} /></label>
          <label className="field">
            <span>Tecnologia</span>
            <select name="technology" defaultValue="qr" required>
              {(Object.keys(technologyLabels) as TrackingEventTechnology[]).filter((technology) => technology !== "manual").map((technology) => (
                <option key={technology} value={technology}>{technologyLabels[technology]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>ID do chip ou etiqueta</span>
            <input name="tagId" required maxLength={180} placeholder="EPC, MAC, IMEI ou código" />
          </label>
          <InlineError message={error} />
          <FormActions busy={busyKey === "tag"} submitLabel="Vincular identificador" />
        </form>
      </section>

      <section className="operational-panel operation-form-panel" aria-labelledby="tracking-event-title">
        <div className="operational-panel-toolbar">
          <div>
            <h2 id="tracking-event-title">Registrar leitura</h2>
            <p>Receba eventos de leitor, gateway, MDM ou GPS.</p>
          </div>
        </div>
        <form className="form-grid operation-form" onSubmit={recordEvent}>
          <label className="field field-wide"><span>Patrimônio</span><AssetSelect assets={dashboard.nucleusInventory} /></label>
          <label className="field">
            <span>Tecnologia</span>
            <select name="technology" defaultValue="manual" required>
              {(Object.keys(technologyLabels) as TrackingEventTechnology[]).map((technology) => (
                <option key={technology} value={technology}>{technologyLabels[technology]}</option>
              ))}
            </select>
          </label>
          <label className="field"><span>ID do chip</span><input name="tagId" maxLength={180} placeholder="Obrigatório para chip ativo" /></label>
          <label className="field"><span>Leitor ou gateway</span><input name="readerId" maxLength={180} placeholder="PORTARIA-01" /></label>
          <label className="field"><span>Local observado</span><input name="location" required maxLength={180} placeholder="Matriz · Almoxarifado" /></label>
          <label className="field"><span>Latitude</span><input name="latitude" type="number" min="-90" max="90" step="any" /></label>
          <label className="field"><span>Longitude</span><input name="longitude" type="number" min="-180" max="180" step="any" /></label>
          <label className="field"><span>Precisão (m)</span><input name="accuracyMeters" type="number" min="0" max="100000" step="0.1" /></label>
          <label className="field"><span>Bateria (%)</span><input name="batteryPercent" type="number" min="0" max="100" step="1" /></label>
          <label className="field field-wide"><span>Observação</span><textarea name="note" maxLength={500} rows={2} /></label>
          <div className="operation-form-actions field-wide operation-form-actions-split">
            <button className="button button-secondary" type="button" disabled={busyKey === "location"} onClick={(event) => fillCurrentLocation(event.currentTarget.form!)}>
              {busyKey === "location" ? "Obtendo posição..." : "Usar posição atual"}
            </button>
            <button className="button button-primary" type="submit" disabled={busyKey === "event"}>{busyKey === "event" ? "Registrando..." : "Registrar leitura"}</button>
          </div>
        </form>
      </section>

      <section className="operational-panel tracking-history-panel" aria-labelledby="tracking-history-title">
        <div className="operational-panel-toolbar">
          <div><h2 id="tracking-history-title">Últimas localizações</h2><p>Linha do tempo consolidada, independentemente da tecnologia.</p></div>
          <span className="record-count">{dashboard.operations.trackingEvents.length} eventos</span>
        </div>
        {dashboard.operations.trackingEvents.length ? (
          <div className="operation-record-list tracking-event-list">
            {dashboard.operations.trackingEvents.map((event) => {
              const asset = assetById(dashboard, event.assetId);
              return (
                <article className="operation-record tracking-event-record" key={event.id}>
                  <div className="operation-record-main">
                    <strong>{asset ? assetLabel(asset) : event.assetId}</strong>
                    <span>{event.location}</span>
                    <small>{event.readerId ? `${event.readerId} · ` : ""}{formatDateTime(event.observedAt)} · {event.observedBy}</small>
                  </div>
                  <StatusPill label={technologyLabels[event.technology]} tone="info" />
                  {event.batteryPercent !== null ? <small className="tracking-battery">Bateria {event.batteryPercent}%</small> : null}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Nenhuma leitura recebida" description="Registre uma leitura ou conecte um leitor ao gateway seguro." />
        )}
      </section>

      <section className="operational-panel tracking-tags-panel" aria-labelledby="tracking-tags-title">
        <div className="operational-panel-toolbar">
          <div><h2 id="tracking-tags-title">Identificadores ativos</h2><p>Chips, etiquetas e vínculos digitais configurados.</p></div>
          <span className="record-count">{dashboard.operations.trackingTags.length} vínculos</span>
        </div>
        {dashboard.operations.trackingTags.length ? (
          <div className="tracking-tag-grid">
            {dashboard.operations.trackingTags.map((tag) => {
              const asset = assetById(dashboard, tag.assetId);
              return (
                <article className="tracking-tag-card" key={tag.id}>
                  <StatusPill label={technologyLabels[tag.technology as TrackingTechnology]} tone="info" />
                  <strong>{tag.tagId}</strong>
                  <span>{asset ? assetLabel(asset) : tag.assetId}</span>
                  <small>Vinculado por {tag.installedBy}</small>
                </article>
              );
            })}
          </div>
        ) : <EmptyState title="Nenhum identificador ativo" description="Vincule QR, RFID, BLE, UWB, GPS ou MDM a um ativo." />}
      </section>
    </div>
  );
}

function messageFrom(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
