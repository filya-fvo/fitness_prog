import { useId, type InputHTMLAttributes, type ReactNode } from "react";

import { fieldClass, joinClassNames } from "@/theme/visualStyles";

type AppFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
};

export function AppField({
  className,
  containerClassName,
  error,
  id,
  label,
  "aria-describedby": describedBy,
  ...props
}: AppFieldProps) {
  const generatedId = useId();
  const inputId = id ?? `app-field-${generatedId}`;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <label className={joinClassNames("app-field-wrap", containerClassName)} htmlFor={inputId}>
      <span className="app-field-label">{label}</span>
      <input
        {...props}
        id={inputId}
        aria-describedby={describedBy ?? errorId}
        aria-invalid={error ? true : props["aria-invalid"]}
        className={joinClassNames(fieldClass(), className)}
      />
      {error ? <span id={errorId} className="app-field-error">{error}</span> : null}
    </label>
  );
}
