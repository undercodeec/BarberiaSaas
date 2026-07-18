export default function AdminHomePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 px-6 text-slate-100">
      <section className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl sm:p-12">
        <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold tracking-widest text-cyan-300 uppercase">
          Uso interno
        </span>
        <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl">
          Panel de operación
        </h1>
        <p className="mt-4 max-w-md text-lg leading-8 text-slate-400">
          La aplicación administrativa está lista para incorporar las funciones
          de operación en su fase correspondiente.
        </p>
        <div className="mt-8 flex items-center gap-3 border-t border-slate-800 pt-6 text-sm text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />{' '}
          Infraestructura disponible
        </div>
      </section>
    </main>
  );
}
