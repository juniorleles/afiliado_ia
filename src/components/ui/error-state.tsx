import Link from "next/link";
import type { ReactNode } from "react";
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
    <ErrorPanel
      title={title}
      happened={message}
      solve="Tente de novo nesta página. Nada é enviado para fora do navegador."
      action={
        onRetry ? (
          <Button type="button" variant="danger" onClick={onRetry}>
            Tentar de novo
          </Button>
        ) : (
          <Button asChild>
            <Link href="/dashboard">Voltar ao Dashboard</Link>
          </Button>
        )
      }
    />
  );
}

function ErrorPanel({
  title,
  happened,
  solve,
  action,
}: {
  title: string;
  happened: string;
  solve: string;
  action: ReactNode;
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-ds-8 rounded-ds-md border border-danger bg-danger-subtle p-ds-24 text-danger">
      <h3 className="text-h3">{title}</h3>
      <p className="text-body">{happened}</p>
      <p className="text-body">{solve}</p>
      {action}
    </div>
  );
}

export function NetworkErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorPanel
      title="Erro de rede"
      happened="A página não conseguiu carregar."
      solve="Confira a conexão e tente de novo."
      action={
        onRetry ? (
          <Button type="button" onClick={onRetry}>
            Tentar de novo
          </Button>
        ) : (
          <Button asChild>
            <Link href="/dashboard">Voltar ao Dashboard</Link>
          </Button>
        )
      }
    />
  );
}

export function SearchErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorPanel
      title="Erro na pesquisa"
      happened="A pesquisa não pôde ser mostrada."
      solve="Volte ao formulário e envie de novo."
      action={
        onRetry ? (
          <Button type="button" onClick={onRetry}>
            Tentar de novo
          </Button>
        ) : (
          <Button asChild>
            <Link href="/pesquisa">Abrir pesquisa</Link>
          </Button>
        )
      }
    />
  );
}

export function UnauthorizedErrorState() {
  return (
    <ErrorPanel
      title="Acesso não autorizado"
      happened="Esta área pede autorização."
      solve="Abra Configurações para ver o estado da conta. Nenhum segredo é mostrado."
      action={
        <Button asChild>
          <Link href="/configuracoes">Abrir configurações</Link>
        </Button>
      }
    />
  );
}

export function UnexpectedErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorPanel
      title="Erro inesperado"
      happened="Esta página parou antes de mostrar o conteúdo."
      solve="Volte ao início ou tente de novo."
      action={
        onRetry ? (
          <Button type="button" onClick={onRetry}>
            Tentar de novo
          </Button>
        ) : (
          <Button asChild>
            <Link href="/dashboard">Voltar ao Dashboard</Link>
          </Button>
        )
      }
    />
  );
}

export function NotFoundErrorState() {
  return (
    <ErrorPanel
      title="Página não encontrada"
      happened="Este endereço não corresponde a um módulo do console."
      solve="Use o menu ou volte ao Dashboard. Todos os módulos ficam a um clique."
      action={
        <Button asChild>
          <Link href="/dashboard">Ir para o Dashboard</Link>
        </Button>
      }
    />
  );
}
