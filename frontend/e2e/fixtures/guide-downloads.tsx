import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GuideReaderPage } from "../../src/features/help/GuideReaderPage";
import { HelpFaqPage } from "../../src/features/help/HelpFaqPage";
import { useUserStore } from "../../src/store/userStore";
import "../../src/index.css";
const admin = new URLSearchParams(location.search).has("admin");
useUserStore.setState({ user: admin ? { id: "22222222-2222-4222-8222-222222222222", username: "Filatov_Slava", subscription_status: "free", onboarding_completed: true } : null, isAuthenticated: admin });
createRoot(document.getElementById("root")!).render(<BrowserRouter><main className="p-4"><button onClick={() => useUserStore.getState().reset()}>Выйти из аккаунта</button><Routes><Route path="/help/instructions/:kind" element={<GuideReaderPage />} /><Route path="*" element={<HelpFaqPage />} /></Routes></main></BrowserRouter>);
