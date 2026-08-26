export default function PayphoneCancelPage() {
  return (
    <main className="subscription-checkout-page">
      <section className="subscription-checkout-shell subscription-checkout-return">
        <p className="eyebrow">Nava · PayPhone</p>
        <h1>Pago cancelado</h1>
        <p className="subscription-checkout-alert">
          No se realizó ningún cobro ni se activó tu suscripción. Puedes volver
          al checkout cuando quieras.
        </p>
        <a className="subscription-checkout-primary" href="/checkout">
          Volver al checkout
        </a>
      </section>
    </main>
  );
}
