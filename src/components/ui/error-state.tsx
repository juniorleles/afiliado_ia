import { Button } from "./button";

export function ErrorState({
  title = "Não foi possível mostrar esta parte",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-ds-md border border-danger bg-danger-subtle p-ds-24 text-danger">
      <h3 className="text-h3">{title}</h3>
      <p className="mt-ds-8 text-body">{message}</p>
      {onRetry ? (
        <Button type="button" variant="danger" className="mt-ds-16" onClick={onRetry}>
          Tentar de novo
        </Button>
      ) : null}
    </div>
  );
}
