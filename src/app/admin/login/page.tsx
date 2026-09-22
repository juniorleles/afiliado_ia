import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = next && next.startsWith("/admin") ? next : "/admin";
  return (
    <div className="mx-auto max-w-md space-y-4">
      <h2 className="text-xl font-semibold">Acesso do operador</h2>
      <p className="text-sm text-zinc-400">
        O painel admin não é público. Use a senha configurada em ADMIN_PASSWORD.
      </p>
      <LoginForm nextPath={nextPath} />
    </div>
  );
}
