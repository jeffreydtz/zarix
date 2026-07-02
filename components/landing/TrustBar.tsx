export default function TrustBar() {
  return (
    <section className="border-y border-border/60 bg-white/[0.02]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 text-center sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground sm:text-base">
          Disenado para quienes ahorran en dolares, invierten en el Merval y viven en pesos.
        </p>
        <div className="grid gap-3 text-sm text-foreground sm:grid-cols-3">
          <p className="rounded-xl border border-border/60 bg-card px-4 py-3">
            <span className="font-semibold text-primary">+2M</span> de argentinos son el mercado objetivo
          </p>
          <p className="rounded-xl border border-border/60 bg-card px-4 py-3">
            <span className="font-semibold text-primary">&lt; 30s</span> para ver tu patrimonio real
          </p>
          <p className="rounded-xl border border-border/60 bg-card px-4 py-3">
            <span className="font-semibold text-primary">5 modulos</span> integrados en un solo panel
          </p>
        </div>
      </div>
    </section>
  );
}
