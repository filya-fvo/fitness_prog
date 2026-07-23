import { Header } from "@/components/layout/Header";

type PlaceholderPageProps = {
  title: string;
  note?: string;
};

export function PlaceholderPage({ title, note = "Раздел будет в следующих спринтах" }: PlaceholderPageProps) {
  return (
    <section>
      <Header title={title} subtitle={note} />
      <div className="rounded-2xl bg-tg-secondary p-4 text-sm text-tg-hint">Скоро</div>
    </section>
  );
}
