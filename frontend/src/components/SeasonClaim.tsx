import { useEffect, useState, type ReactElement } from "react";

import { hasSeasonContract, seasonClient } from "../chain/season.ts";
import { useLanguage } from "../i18n/language.tsx";
import { useWallet } from "../wallet/context.tsx";

type Status = "loading" | "ready" | "claimed" | "error";

export function SeasonClaim({
  completed,
  variant = "home",
}: {
  completed: boolean;
  variant?: "home" | "device";
}): ReactElement | null {
  const { t } = useLanguage();
  const { address, signer } = useWallet();
  const [status, setStatus] = useState<Status>("loading");
  const [tokenId, setTokenId] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!completed || !hasSeasonContract() || !address || !signer) return;
    let alive = true;
    setStatus("loading");
    void seasonClient(address, signer)
      .then(async (client) => {
        const claimed = await client.has_claimed({ player: address });
        const id = await client.token_of({ player: address });
        if (!alive) return;
        if (claimed.result === true) {
          setTokenId(id.result === null || id.result === undefined ? null : Number(id.result));
          setStatus("claimed");
        } else {
          setStatus("ready");
        }
      })
      .catch(() => {
        if (alive) setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [completed, address, signer, attempt]);

  if (!completed || !hasSeasonContract() || !address || !signer) return null;

  const buttonClass = variant === "device" ? "device__link" : "button";

  if (status === "loading") {
    return <p className="season-claim season-claim__note">{t("collection.claimLoading")}</p>;
  }

  if (status === "claimed") {
    return <p className="season-claim season-claim__note">{t("collection.claimed", { id: tokenId ?? "?" })}</p>;
  }

  if (status === "error") {
    return (
      <div className="season-claim">
        <p className="season-claim__note">{t("collection.claimError")}</p>
        <button type="button" className={buttonClass} onClick={() => setAttempt((value) => value + 1)}>
          {t("collection.claimRetry")}
        </button>
      </div>
    );
  }

  const claim = async (): Promise<void> => {
    setClaiming(true);
    try {
      const client = await seasonClient(address, signer);
      const tx = await client.claim({ player: address });
      const sent = await tx.signAndSend();
      setTokenId(sent.result === null || sent.result === undefined ? null : Number(sent.result));
      setStatus("claimed");
    } catch {
      setStatus("error");
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="season-claim">
      <button type="button" className={buttonClass} disabled={claiming} onClick={() => void claim()}>
        {claiming ? t("collection.claiming") : t("collection.claim")}
      </button>
      <p className="season-claim__note">{t("collection.soulbound")}</p>
    </div>
  );
}
