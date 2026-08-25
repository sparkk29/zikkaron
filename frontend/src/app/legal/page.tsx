export default function LegalPage() {
  return (
    <section>
      <h1>Legal & positioning</h1>
      <div className="panel">
        <p>
          <strong>Zikkaron</strong> (Hebrew זִכָּרוֹן — memorial, remembrance, lasting record) is
          civic assistance infrastructure. It supplies structured evidence packs, occupancy
          registries, and document integrity to <em>support</em> county recorders, assessors,
          police/sheriffs, prosecutors, and courts.
        </p>
        <p>It never pretends to be those institutions or to hold legal title.</p>
      </div>
      <div className="panel">
        <h3>Partnership rules</h3>
        <ul>
          <li>Authorities remain sovereign — Zikkaron assists; it does not issue warrants, recordings, or judgments.</li>
          <li>MVP uses simulated authority accounts and integration placeholders.</li>
          <li>Owner data shared with authorities only via explicit owner share, authority role login, or logged export request.</li>
          <li>No fake seals, badges, or “FBI verified” chrome.</li>
        </ul>
      </div>
      <div className="warn-box">
        Eviction requires lawful process under state law. Do not use this product to plan illegal
        self-help lockouts. Memorial ≠ service of process or court order. Hash ≠ county seal
        authenticity.
      </div>
    </section>
  );
}
