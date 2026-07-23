type HeaderProps = {
  title: string;
  subtitle?: string;
};

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="mb-4">
      <h1 className="text-xl font-semibold text-tg-text">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-tg-hint">{subtitle}</p> : null}
    </header>
  );
}
