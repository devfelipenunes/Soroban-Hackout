import type { ReactElement } from "react";

import { useAccount } from "../chain/account.tsx";
import { useLanguage } from "../i18n/language.tsx";

export function AccountNotice(): ReactElement | null {
  const { t } = useLanguage();
  const { status, fund } = useAccount();

  if (status.phase === "idle" || status.phase === "ready") {
    return null;
  }

  if (status.phase === "failed") {
    return (
      <p className="message message--error">
        <span>{t("account.failed", { reason: status.reason })}</span>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void fund()}
        >
          {t("wallet.tryAgain")}
        </button>
      </p>
    );
  }

  const text =
    status.phase === "funding" ? t("account.funding") : t("account.checking");

  return (
    <p className="notice pulse">
      <span>{text}</span>
    </p>
  );
}
