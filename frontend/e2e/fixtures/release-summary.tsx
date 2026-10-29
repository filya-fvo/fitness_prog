import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { Shell } from "../../src/components/layout/Shell";
import { setStoredToken, clearStoredToken } from "../../src/api/client";
import type { AuthUser } from "../../src/api/auth";
import { useUserStore } from "../../src/store/userStore";
import { cacheUserProfile } from "../../src/utils/profileCache";
import { initializeTheme } from "../../src/theme/theme";
import "../../src/index.css";

initializeTheme();
if (!localStorage.getItem("fitness_jwt")) setStoredToken("release-owner-a");
Object.assign(window, {
  switchReleaseOwner(user: AuthUser | null) {
    if (user) { setStoredToken(`release-owner-${user.username}`); cacheUserProfile(user); }
    else clearStoredToken();
    useUserStore.getState().setUser(user);
    useUserStore.getState().setAuthLoading(false);
  },
});
function Fixture() {
  const [draft, setDraft] = useState("");
  const [modal, setModal] = useState(new URLSearchParams(location.search).has("modal"));
  return <MemoryRouter initialEntries={[new URLSearchParams(location.search).get("route") || "/"]}>
    <Routes><Route element={<Shell />}>
      <Route path="*" element={<main><h1>Тестовая страница</h1><Link to="/">На главную</Link><Link to="/programs/new">Открыть форму</Link><Link to="/workouts/active/fixture">Открыть тренировку</Link><label>Заметка<input value={draft} onChange={event => setDraft(event.target.value)} /></label><label>Другая заметка<input /></label><button type="button" onClick={() => setModal(true)}>Другой диалог</button></main>} />
    </Route></Routes>
    {modal ? <div role="dialog" aria-modal="true" aria-label="Другой диалог" className="fixed inset-0 z-[60] grid place-items-center bg-tg-bg"><button type="button" onClick={() => setModal(false)}>Закрыть другой диалог</button></div> : null}
  </MemoryRouter>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Fixture /></StrictMode>);
