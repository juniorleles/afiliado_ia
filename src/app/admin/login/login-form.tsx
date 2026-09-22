"use client";

import { useActionState } from "react";
import { loginAdminAction, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action] = useActionState(loginAdminAction, initial);
  return (
    <form action={action} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950 p-6">
      <input type="hidden" name="next" value={nextPath} />
      <label className="block text-sm text-zinc-300">
        Senha do operador
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
        />
      </label>
      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}
      <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white">
        Entrar
      </button>
    </form>
  );
}
