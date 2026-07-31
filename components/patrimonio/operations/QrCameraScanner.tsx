"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeScannedIdentifier } from "../hooks";

type ScannerControls = { stop: () => void };

export function QrCameraScanner({
  disabled = false,
  onDetected,
}: {
  disabled?: boolean;
  onDetected: (identifier: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("Posicione a etiqueta dentro da área de leitura.");
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<ScannerControls | null>(null);
  const detectedRef = useRef(false);

  useEffect(() => {
    if (!open || !videoRef.current) return;
    let cancelled = false;
    detectedRef.current = false;
    setStatus("Solicitando acesso à câmera...");

    void import("@zxing/browser").then(async ({ BrowserMultiFormatReader }) => {
      if (cancelled || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 500,
      });
      try {
        const controls = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => {
            if (!result || detectedRef.current) return;
            const identifier = extractAssetIdentifier(result.getText());
            if (!identifier) {
              setStatus("Código lido, mas sem um patrimônio válido.");
              return;
            }
            detectedRef.current = true;
            controlsRef.current?.stop();
            onDetected(identifier);
            setOpen(false);
          },
        );
        if (cancelled) controls.stop();
        else {
          controlsRef.current = controls;
          setStatus("Câmera pronta para leitura.");
        }
      } catch {
        if (!cancelled) setStatus("Não foi possível abrir a câmera. Use uma imagem da etiqueta.");
      }
    });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [onDetected, open]);

  async function readImage(file: File | undefined) {
    if (!file) return;
    setStatus("Analisando imagem...");
    const objectUrl = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const result = await new BrowserMultiFormatReader().decodeFromImageUrl(objectUrl);
      const identifier = extractAssetIdentifier(result.getText());
      if (!identifier) {
        setStatus("A imagem não contém um patrimônio válido.");
        return;
      }
      controlsRef.current?.stop();
      onDetected(identifier);
      setOpen(false);
    } catch {
      setStatus("Nenhum QR ou código de barras foi reconhecido na imagem.");
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function close() {
    controlsRef.current?.stop();
    setOpen(false);
  }

  return (
    <>
      <button className="button button-secondary button-small" type="button" disabled={disabled} onClick={() => setOpen(true)}>
        <CameraIcon /> Ler QR
      </button>
      {open ? (
        <div className="qr-scanner-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="qr-scanner-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-scanner-title">
            <header><div><h2 id="qr-scanner-title">Leitor por câmera</h2><p>{status}</p></div><button type="button" aria-label="Fechar leitor" title="Fechar leitor" onClick={close}>×</button></header>
            <div className="qr-scanner-preview"><video ref={videoRef} muted playsInline /><span aria-hidden="true" /></div>
            <footer><label className="button button-secondary"><ImageIcon /> Escolher imagem<input type="file" accept="image/*" capture="environment" onChange={(event) => void readImage(event.target.files?.[0])} /></label><button className="button button-primary" type="button" onClick={close}>Concluir leitura</button></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function extractAssetIdentifier(rawValue: string): string | null {
  const direct = normalizeScannedIdentifier(rawValue);
  if (direct) return direct;
  const normalized = rawValue.trim().toUpperCase();
  const official = normalized.match(/(?:^|\D)(\d{6})(?:\D|$)/)?.[1];
  if (official) return official;
  const internal = normalized.match(/(?:^|[^A-Z0-9])(S[A-Z0-9]{5})(?:[^A-Z0-9]|$)/)?.[1];
  if (internal && normalizeScannedIdentifier(internal)) return internal;

  const sabiumInternal = normalized.match(/(?:^|[^A-F0-9])(G[A-F0-9]{20})(?:[^A-F0-9]|$)/)?.[1];
  return sabiumInternal && normalizeScannedIdentifier(sabiumInternal) ? sabiumInternal : null;
}

function CameraIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M8 7 9.5 4h5L16 7h3a2 2 0 0 1 2 2v9H3V9a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><circle cx="12" cy="12.5" r="3.2" stroke="currentColor" strokeWidth="1.7" /></svg>;
}

function ImageIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" /><circle cx="9" cy="9" r="1.5" fill="currentColor" /><path d="m5 18 5-5 3 3 2-2 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
