"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { WizardFormState } from "@/app/admin/new/actions";
import { startCampaignWizardAction } from "@/app/admin/new/actions";
import { WizardSection } from "@/components/campaign-wizard/wizard-section";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchInput } from "@/components/ui/search-input";
import { Textarea } from "@/components/ui/textarea";
import { fieldClass } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import {
  CAMPAIGN_GOALS,
  COUNTRIES,
  GENERATION_OPTIONS,
  LANGUAGES,
  MARKETPLACES,
  RESEARCH_SOURCES,
} from "@/lib/campaign-brief-options";

const initialState: WizardFormState = {};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-caption text-danger">
      {message}
    </p>
  );
}

function Choice({
  id,
  name,
  label,
  value,
  options,
  error,
  placeholder,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  error?: string;
  placeholder: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-ds-4">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(fieldClass, "flex h-10")}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function CampaignWizardForm({ productNames }: { productNames: string[] }) {
  const [state, formAction, pending] = useActionState(startCampaignWizardAction, initialState);
  const values = state.values;
  const research = new Set(values?.research ?? RESEARCH_SOURCES.map((item) => item.value));
  const generation = new Set(values?.generation ?? GENERATION_OPTIONS.map((item) => item.value));

  return (
    <form action={formAction} className="flex flex-col gap-ds-32" key={state.error ?? "ready"}>
      {state.error ? <Alert tone="danger" title="Faltam alguns dados">{state.error}</Alert> : null}

      <WizardSection id="campaign-details" title="Campanha">
        <div className="flex flex-col gap-ds-4">
          <Label htmlFor="campaign-name">Nome da campanha</Label>
          <Input
            id="campaign-name"
            name="name"
            defaultValue={values?.name}
            required
            invalid={Boolean(state.fieldErrors?.name)}
            aria-describedby={state.fieldErrors?.name ? "campaign-name-error" : undefined}
          />
          <FieldError id="campaign-name-error" message={state.fieldErrors?.name} />
        </div>
        <div className="flex flex-col gap-ds-4">
          <Label htmlFor="campaign-notes">Notas internas (opcional)</Label>
          <Textarea
            id="campaign-notes"
            name="notes"
            defaultValue={values?.notes}
            rows={4}
            invalid={Boolean(state.fieldErrors?.notes)}
            aria-describedby={state.fieldErrors?.notes ? "campaign-notes-error" : undefined}
          />
          <FieldError id="campaign-notes-error" message={state.fieldErrors?.notes} />
        </div>
      </WizardSection>

      <WizardSection id="product-details" title="Produto">
        <div className="grid gap-ds-16 lg:grid-cols-2">
          <SearchInput
            id="product-name"
            name="productName"
            label="Nome do produto"
            list="known-products"
            defaultValue={values?.productName}
            required
            placeholder="Busque ou digite um produto"
            invalid={Boolean(state.fieldErrors?.productName)}
            error={state.fieldErrors?.productName}
            autoComplete="off"
          />
          <datalist id="known-products">
            {productNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <Choice
            id="marketplace"
            name="marketplace"
            label="Marketplace"
            value={values?.marketplace ?? ""}
            options={MARKETPLACES}
            error={state.fieldErrors?.marketplace}
            placeholder="Escolha um marketplace"
          />
          <div className="flex flex-col gap-ds-4">
            <Label htmlFor="brand">Marca (opcional)</Label>
            <Input
              id="brand"
              name="brand"
              defaultValue={values?.brand}
              invalid={Boolean(state.fieldErrors?.brand)}
              aria-describedby={state.fieldErrors?.brand ? "brand-error" : undefined}
            />
            <FieldError id="brand-error" message={state.fieldErrors?.brand} />
          </div>
          <div className="flex flex-col gap-ds-4">
            <Label htmlFor="category">Categoria</Label>
            <Input
              id="category"
              name="category"
              defaultValue={values?.category}
              required
              invalid={Boolean(state.fieldErrors?.category)}
              aria-describedby={state.fieldErrors?.category ? "category-error" : undefined}
            />
            <FieldError id="category-error" message={state.fieldErrors?.category} />
          </div>
          <Choice
            id="country"
            name="country"
            label="País"
            value={values?.country ?? ""}
            options={COUNTRIES}
            error={state.fieldErrors?.country}
            placeholder="Escolha um país"
          />
          <Choice
            id="language"
            name="language"
            label="Idioma"
            value={values?.language ?? ""}
            options={LANGUAGES}
            error={state.fieldErrors?.language}
            placeholder="Escolha um idioma"
          />
        </div>
      </WizardSection>

      <WizardSection id="campaign-goal" title="Objetivo da campanha">
        <fieldset aria-labelledby="campaign-goal" className="flex flex-col gap-ds-12">
          <div className="grid gap-ds-16 sm:grid-cols-2">
            {CAMPAIGN_GOALS.map((goal) => (
              <label key={goal.value} className="flex min-h-20 cursor-pointer items-center gap-ds-12 rounded-ds-md border border-border bg-background px-ds-16 text-body has-[:checked]:border-primary has-[:checked]:bg-secondary">
                <input
                  type="radio"
                  name="goal"
                  value={goal.value}
                  defaultChecked={values?.goal === goal.value}
                  required
                  className="h-ds-16 w-ds-16 accent-primary"
                />
                {goal.label}
              </label>
            ))}
          </div>
          <FieldError id="goal-error" message={state.fieldErrors?.goal} />
        </fieldset>
      </WizardSection>

      <WizardSection id="market-research" title="Pesquisa de mercado">
        <div className="grid gap-ds-12 sm:grid-cols-2">
          {RESEARCH_SOURCES.map((source) => (
            <Checkbox key={source.value} name="research" value={source.value} label={source.label} defaultChecked={research.has(source.value)} />
          ))}
        </div>
      </WizardSection>

      <WizardSection id="generation-options" title="O que a IA vai preparar">
        <div className="grid gap-ds-12 sm:grid-cols-2">
          {GENERATION_OPTIONS.map((option) => (
            <Checkbox key={option.value} name="generation" value={option.value} label={option.label} defaultChecked={generation.has(option.value)} />
          ))}
        </div>
      </WizardSection>

      <div className="flex flex-col-reverse gap-ds-12 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="secondary">
          <Link href="/admin">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pending} className="h-12 px-ds-24 sm:min-w-64">
          {pending ? "Salvando…" : "Continuar"}
        </Button>
      </div>
    </form>
  );
}
