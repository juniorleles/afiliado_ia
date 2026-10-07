"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export function ExampleConfirmButton({
  label,
  title,
  description,
  success,
}: {
  label: string;
  title: string;
  description: string;
  success: string;
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        primaryLabel="Confirmar"
        onPrimary={() => toast.push({ message: success, tone: "success" })}
      />
    </>
  );
}
