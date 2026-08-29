type Props = {
  emailAvailable: boolean;
  emailEnabled: boolean;
  disabled: boolean;
  onEmailEnabledChange: (enabled: boolean) => void;
};

export function ServiceMessageConsentCard({
  emailAvailable,
  emailEnabled,
  disabled,
  onEmailEnabledChange,
}: Props) {
  return (
    <div className="rounded-2xl bg-tg-secondary p-4">
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>
          <span className="font-medium">Служебные сообщения на email</span>
          <span className="mt-1 block text-xs font-normal text-tg-hint">
            Разрешает поддержке написать вам по привязанной почте. Рекламные рассылки сюда не входят.
          </span>
        </span>
        <input
          type="checkbox"
          checked={emailAvailable && emailEnabled}
          disabled={disabled || !emailAvailable}
          onChange={(event) => onEmailEnabledChange(event.target.checked)}
          aria-label="Разрешить служебные сообщения на email"
        />
      </label>
      {!emailAvailable ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Сначала привяжите email в разделе аккаунта.
        </p>
      ) : null}
    </div>
  );
}
