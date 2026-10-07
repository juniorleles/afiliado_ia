export function Separator({ orientation = "horizontal" }: { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={orientation === "vertical" ? "mx-ds-8 h-ds-24 w-px bg-border" : "my-ds-8 h-px w-full bg-border"}
    />
  );
}
