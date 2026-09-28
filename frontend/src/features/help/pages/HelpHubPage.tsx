import { Header } from "@/components/layout/Header";
import { HelpFeatureCard } from "@/features/help/components/HelpFeatureCard";

export function HelpHubPage() {
  return (
    <section>
      <Header title="Помощь" subtitle="Мы рядом на каждом этапе" />
      <div className="space-y-3">
        <HelpFeatureCard to="/ai" title="ИИ-тренер" description="Персональные рекомендации, ответы на вопросы и поддержка 24/7" action="Задать вопрос" feature="coach" badge="Новое" />
        <HelpFeatureCard to="/support" title="Поддержка" description="Наша команда поможет решить любой вопрос" action="Написать в поддержку" feature="support" />
        <HelpFeatureCard to="/faq" title="Помощь и FAQ" description="База знаний, инструкции и ответы на популярные вопросы" action="Открыть FAQ" feature="faq" />
      </div>
    </section>
  );
}
