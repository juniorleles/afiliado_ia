"use client";

import { useEffect } from "react";

export function ScrollToLanding({ id }: { id: number }) {
  useEffect(() => {
    document.getElementById(`landing-${id}`)?.scrollIntoView({ block: "center" });
  }, [id]);
  return null;
}
