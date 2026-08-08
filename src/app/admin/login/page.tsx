"use client";

import { useActionState } from "react";
import { adminLoginAction, type AdminLoginResult } from "@/lib/actions/admin-actions";

const initialState: AdminLoginResult = { ok: true };

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(adminLoginAction, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Coleman Storybook</p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">Staff sign in</h1>
      </div>

      <form action={formAction} className="flex flex-col gap-4" noValidate>
        <label className="text-sm font-medium text-gray-700">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>
        <label className="text-sm font-medium text-gray-700">
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-base"
          />
        </label>

        {!state.ok && state.error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {state.error}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-gray-900 px-4 py-2 font-medium text-white transition hover:bg-gray-800 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="text-xs text-gray-500">
        This area is restricted to authorized Camp Coleman staff. No public access to submissions or media.
      </p>
    </main>
  );
}
