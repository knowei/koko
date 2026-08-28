import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

type ConfirmRequest = ConfirmOptions & { resolve: (confirmed: boolean) => void };
type ConfirmFunction = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFunction>((options) => new Promise((resolve) => {
    setRequest((current) => {
      current?.resolve(false);
      return { ...options, resolve };
    });
  }), []);

  const close = useCallback((confirmed: boolean) => {
    setRequest((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!request) return;
    confirmButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, request]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {request && (
        <div className="confirm-dialog-mask" onClick={() => close(false)}>
          <div
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`confirm-dialog-icon ${request.tone === "danger" ? "danger" : ""}`}>
              {request.tone === "danger" ? "!" : "?"}
            </div>
            <div className="confirm-dialog-content">
              <h2 id="confirm-dialog-title">{request.title}</h2>
              <p id="confirm-dialog-description">{request.description}</p>
            </div>
            <div className="confirm-dialog-actions">
              <button type="button" className="confirm-dialog-cancel" onClick={() => close(false)}>
                {request.cancelLabel || "取消"}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className={`confirm-dialog-submit ${request.tone === "danger" ? "danger" : ""}`}
                onClick={() => close(true)}
              >
                {request.confirmLabel || "确定"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirmDialog() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirmDialog must be used inside ConfirmDialogProvider");
  return confirm;
}
