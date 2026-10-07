import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

export type RadioOption = { value: string; label: string };

export function RadioGroup({
  legend,
  name,
  value,
  onValueChange,
  options,
}: {
  legend: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  options: RadioOption[];
}) {
  return (
    <fieldset className="flex flex-col gap-ds-8">
      <legend className="mb-ds-4 text-caption text-foreground">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="inline-flex items-center gap-ds-8 text-body text-foreground">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onValueChange(option.value)}
            className={cn("h-ds-16 w-ds-16 accent-primary", focusRing)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
