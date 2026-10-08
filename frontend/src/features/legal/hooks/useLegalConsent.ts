import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logout, type AuthUser } from "@/api/auth";
import { getStoredToken } from "@/api/client";
import { acceptLegalDocuments, fetchLegalStatus, type LegalStatus } from "@/api/legal";
import { useUserStore } from "@/store/userStore";
import { cacheUserProfile } from "@/utils/profileCache";
import { isOnline } from "@/utils/network";
import { toUserMessage } from "@/utils/errors";
import { legalDocuments, type LegalDocumentId } from "../documents";
import { mergeAcceptedLegalStatus } from "../legalState";

export function useLegalConsent(user: AuthUser) {
  const navigate = useNavigate();
  const [checks, setChecks] = useState<Record<LegalDocumentId, boolean>>({ privacy: false, consent: false, offer: false });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(isOnline);
  const active = useRef(false);
  const owner = user.id;

  function apply(status: LegalStatus, token: string | null) {
    const current = useUserStore.getState().user;
    if (!active.current || current?.id !== owner || getStoredToken() !== token) return;
    const updated = mergeAcceptedLegalStatus(current, status);
    if (!updated) return;
    useUserStore.getState().setUser(updated);
    cacheUserProfile(updated);
  }

  useEffect(() => {
    active.current = true;
    let refreshing = false;
    const refresh = async () => {
      setOnline(isOnline());
      if (!isOnline() || refreshing) return;
      refreshing = true;
      const token = getStoredToken();
      try {
        const status = await fetchLegalStatus();
        const current = useUserStore.getState().user;
        if (active.current && current?.id === owner && getStoredToken() === token) {
          const updated = mergeAcceptedLegalStatus(current, status);
          if (updated) { useUserStore.getState().setUser(updated); cacheUserProfile(updated); }
        }
      } catch {
        // A failed read never creates acceptance; the explicit save reports errors.
      } finally { refreshing = false; }
    };
    const disconnected = () => setOnline(false);
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", disconnected);
    return () => {
      active.current = false;
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", disconnected);
    };
  }, [owner]);

  function setCheck(id: LegalDocumentId, checked: boolean) {
    setChecks((previous) => ({ ...previous, [id]: checked }));
  }

  async function submit() {
    if (pending || !Object.values(checks).every(Boolean)) return;
    if (!isOnline()) { setError("Подключитесь к интернету, чтобы сохранить подтверждение."); return; }
    const token = getStoredToken();
    setPending(true); setError(null);
    try {
      const status = await acceptLegalDocuments({ documents: legalDocuments.map((document) => ({ document_id: document.document_id, revision: document.revision, text_sha256: document.text_sha256, accepted: true })) });
      apply(status, token);
    } catch (failure) {
      if (active.current && useUserStore.getState().user?.id === owner && getStoredToken() === token) {
        setError(toUserMessage(failure, "Не удалось сохранить подтверждение. Попробуйте снова."));
      }
    } finally { if (active.current) setPending(false); }
  }

  const decline = useCallback(() => {
    if (pending) return;
    logout();
    useUserStore.getState().reset();
    navigate("/legal/privacy", { replace: true });
  }, [navigate, pending]);

  return { status: user.legal_status, checks, setCheck, submit, pending, error, decline, online };
}
