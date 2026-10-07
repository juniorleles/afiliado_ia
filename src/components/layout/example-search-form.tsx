"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function ExampleSearchForm() {
  const [country, setCountry] = useState("us");
  const [note, setNote] = useState("");

  return (
    <form
      className="flex max-w-xl flex-col gap-ds-16"
      onSubmit={(event) => {
        event.preventDefault();
        setNote("A busca não é enviada. Este campo só mostra a estrutura.");
      }}
    >
      <div>
        <Label htmlFor="keyword">Keyword</Label>
        <Input id="keyword" name="keyword" placeholder="Keyword" />
      </div>
      <Select
        label="País"
        value={country}
        onValueChange={setCountry}
        options={[
          { value: "us", label: "Estados Unidos" },
          { value: "br", label: "Brasil" },
        ]}
      />
      <Button type="submit">Pesquisar</Button>
      {note ? (
        <p role="status" className="text-body text-muted-foreground">
          {note}
        </p>
      ) : null}
    </form>
  );
}
