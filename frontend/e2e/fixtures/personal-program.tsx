import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { PersonalProgramBuilderPage } from "../../src/features/workout/pages/PersonalProgramBuilderPage";
import { useUserStore } from "../../src/store/userStore";
import "../../src/index.css";
import { initializeTheme } from "../../src/theme/theme";
initializeTheme();
useUserStore.setState({ user: { id: "22222222-2222-4222-8222-222222222222", subscription_status: "free", onboarding_completed: true }, isAuthenticated: true });
window.addEventListener("fixture-owner", event => {
  const id = (event as CustomEvent<string>).detail;
  useUserStore.setState({ user: { id, subscription_status: "free", onboarding_completed: true }, isAuthenticated: true });
});
createRoot(document.getElementById("root")!).render(<BrowserRouter><main className="p-4"><PersonalProgramBuilderPage /></main></BrowserRouter>);
