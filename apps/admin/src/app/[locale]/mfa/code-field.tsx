export function CodeField({ label }: { label: string }) {
  return (
    <label className="grid gap-2 text-sm font-bold">
      {label}
      <input
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        minLength={6}
        maxLength={7}
        required
        dir="ltr"
        className="min-h-11 rounded-lg border border-line bg-white px-3 py-3 text-center font-mono text-xl font-normal tracking-[.35em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal"
      />
    </label>
  );
}
