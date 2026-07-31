"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import type { Dashboard } from "../types";
import { AssetIdentifier } from "../ui";

export function QrLabelGenerator({ dashboard }: { dashboard: Dashboard }) {
  const [assetId, setAssetId] = useState(dashboard.nucleusInventory[0]?.id ?? "");
  const [qrResult, setQrResult] = useState<{
    payload: string;
    dataUrl: string;
    error: string | null;
  }>({ payload: "", dataUrl: "", error: null });
  const asset = useMemo(
    () => dashboard.nucleusInventory.find((item) => item.id === assetId)
      ?? dashboard.nucleusInventory[0]
      ?? null,
    [assetId, dashboard.nucleusInventory],
  );
  const visibleIdentifier = asset?.sourceIdentifier || asset?.id || "";
  const qrPayload = asset?.id || "";
  const dataUrl = qrResult.payload === qrPayload ? qrResult.dataUrl : "";
  const error = qrResult.payload === qrPayload ? qrResult.error : null;

  useEffect(() => {
    let cancelled = false;
    if (!qrPayload) return;
    void QRCode.toDataURL(qrPayload, {
      width: 384,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#10263a", light: "#ffffff" },
    }).then((value) => {
      if (!cancelled) {
        setQrResult({ payload: qrPayload, dataUrl: value, error: null });
      }
    }).catch(() => {
      if (!cancelled) {
        setQrResult({
          payload: qrPayload,
          dataUrl: "",
          error: "Não foi possível gerar a etiqueta selecionada.",
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [qrPayload]);

  const downloadName = [visibleIdentifier, asset?.incorporation]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join("-inc-")
    .replace(/[^A-Za-z0-9.-]/g, "-") || "patrimonio";

  return (
    <section className="operational-panel operation-form-panel qr-label-panel" aria-labelledby="qr-label-title">
      <div className="operational-panel-toolbar">
        <div>
          <h2 id="qr-label-title">Etiqueta QR</h2>
          <p>Gere a identificação usada pelo leitor de câmera e pelo inventário.</p>
        </div>
      </div>
      <div className="qr-label-generator">
        <label className="field">
          <span>Patrimônio</span>
          <select value={asset?.id ?? ""} onChange={(event) => setAssetId(event.target.value)}>
            {dashboard.nucleusInventory.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sourceIdentifier || item.id}
                {item.sourceSystem === "sabium" && item.incorporation !== null
                  ? ` · Inc. ${item.incorporation}`
                  : ""}
                {` · ${item.brandModel}`}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="operation-inline-error" role="alert">{error}</p> : null}
        {dataUrl && asset ? (
          <div className="qr-label-preview">
            <Image
              src={dataUrl}
              alt={`QR Code do patrimônio ${visibleIdentifier}`}
              width={128}
              height={128}
              unoptimized
            />
            <div>
              <strong><AssetIdentifier asset={asset} /></strong>
              <span>{asset.brandModel}</span>
              <small>{dashboard.options.assetTypes[asset.type]}</small>
              <a
                className="button button-secondary button-small"
                href={dataUrl}
                download={`patrimonio-${downloadName}.png`}
              >
                Baixar PNG
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
