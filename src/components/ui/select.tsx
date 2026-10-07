"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";
import { fieldClass } from "./styles";

export type SelectOption = { value: string; label: string };

export function Select({
  id,
  label,
  value,
  onValueChange,
  options,
  placeholder = "Escolher",
}: {
  id?: string;
  label: string;
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
}) {
  const generatedId = React.useId();
  const triggerId = id ?? generatedId;

  return (
    <div>
      <Label htmlFor={triggerId}>{label}</Label>
      <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
        <SelectPrimitive.Trigger id={triggerId} className={cn(fieldClass, "flex h-10 items-center justify-between gap-ds-8 text-left")}>
          <SelectPrimitive.Value placeholder={placeholder} />
          <span className="inline-flex shrink-0 items-center gap-ds-4 text-caption text-muted-foreground">
            Abrir
            <ChevronDown aria-hidden className="h-ds-16 w-ds-16" strokeWidth={1.5} />
          </span>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-ds-md border border-border bg-card text-foreground shadow-ds-1"
            position="popper"
            sideOffset={4}
          >
            <SelectPrimitive.Viewport className="p-ds-4">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  className="rounded-ds-sm px-ds-12 py-ds-8 text-body outline-none focus:bg-secondary data-[highlighted]:bg-secondary data-[state=checked]:text-primary-text"
                  value={option.value}
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  );
}
