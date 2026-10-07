import * as React from "react";
import { Input } from "./input";
import { UiIcon } from "./icons";
import { Label } from "./label";

export interface SearchInputProps extends Omit<React.ComponentProps<"input">, "type"> {
  label?: string;
  shortcut?: string;
  invalid?: boolean;
  error?: string;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ id, label = "Buscar", shortcut, error, invalid, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;
    const describedBy = [shortcut ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

    return (
      <div>
        <Label htmlFor={inputId}>{label}</Label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-ds-12 flex items-center text-muted-foreground">
            <UiIcon name="search" />
          </span>
          <Input
            ref={ref}
            id={inputId}
            type="search"
            invalid={invalid || Boolean(error)}
            aria-describedby={describedBy}
            className="pl-ds-40"
            {...props}
          />
        </div>
        {shortcut ? (
          <p id={hintId} className="mt-ds-4 text-caption text-muted-foreground">
            {shortcut}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="mt-ds-4 text-caption text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
