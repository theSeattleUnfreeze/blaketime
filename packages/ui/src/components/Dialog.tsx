import { useEffect, useId, useRef, type ReactNode } from "react";
import { t } from "../messages";
export function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header className="dialog-header">
        <h2 id={id}>{title}</h2>
        <button onClick={close}>{t("app.close")}</button>
      </header>
      {children}
    </dialog>
  );
}
