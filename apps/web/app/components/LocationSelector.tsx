import Link from 'next/link';

export function LocationSelector({
  locations,
  organization,
}: {
  readonly locations: ReadonlyArray<{
    readonly formattedAddress: string | null;
    readonly name: string;
    readonly slug: string;
  }>;
  readonly organization: { readonly name: string; readonly slug: string };
}) {
  return (
    <main className="min-h-screen bg-[#0a0c0e] px-5 py-16 text-white sm:px-8">
      <section className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center">
        <p className="mb-3 text-xs font-bold tracking-[0.2em] text-[#c89449] uppercase">
          Reservas
        </p>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
          Elige una sucursal de {organization.name}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-[#9ea5a8]">
          Selecciona dónde quieres atenderte para consultar servicios,
          profesionales y horarios disponibles.
        </p>
        <div className="mt-8 grid gap-3">
          {locations.map((location) => (
            <Link
              className="rounded-2xl border border-white/15 bg-white/[0.03] p-5 transition hover:border-[#c89449] hover:bg-white/[0.07]"
              href={`/${encodeURIComponent(organization.slug)}/${encodeURIComponent(location.slug)}`}
              key={location.slug}
            >
              <p className="font-bold">{location.name}</p>
              <p className="mt-1 text-sm text-[#9ea5a8]">
                {location.formattedAddress ?? 'Ubicación por confirmar'}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
