import { Header } from "@/components/layout/Header";
import { HubLinkCard } from "@/components/ui/HubLinkCard";

export function HelpHubPage() {
  return (
    <section>
      <Header title="Помощь" subtitle="Подсказки, поддержка и персональный разбор" />
      <div className="space-y-3">
        <HubLinkCard to="/ai" title="ИИ-тренер" description="Техника, замены упражнений и разбор прогресса" icon="ai" tone="plum" />
        <HubLinkCard to="/support" title="Поддержка" description="Задайте вопрос и следите за ответом внутри приложения" icon="support" tone="ocean" />
        <HubLinkCard to="/faq" title="Помощь и FAQ" description="Быстрые ответы по тренировкам, питанию и приложению" icon="faq" tone="indigo" />
      </div>
    </section>
  );
}
