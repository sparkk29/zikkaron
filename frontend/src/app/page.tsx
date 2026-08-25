import Link from "next/link";

export default function HomePage() {
  return (
    <section className="hero">
      <p className="tag">United States · Civic assistance infrastructure</p>
      <h1>Zikkaron</h1>
      <p>
        A memorial layer that works with authorities — not instead of them. Structured evidence
        packs, occupancy registries, and document integrity to help county clerks, police and
        sheriffs, prosecutors, and property owners deter squatters and property fraudsters.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link className="btn accent" href="/authority">
          Authority Console
        </Link>
        <Link className="btn secondary" href="/properties">
          Property memorials
        </Link>
        <Link className="btn secondary" href="/occupancy">
          Occupancy & incidents
        </Link>
      </div>

      <div className="grid" style={{ marginTop: "2rem" }}>
        <article className="panel">
          <h3>For owners</h3>
          <p className="muted">
            Bind APN, deed CIDs, and authorized occupants into timestamped memorials you can share
            with counsel and authorities.
          </p>
        </article>
        <article className="panel">
          <h3>For authorities</h3>
          <p className="muted">
            Read-only lookup of who the owner claims is authorized, incident timelines, and exportable
            case packs — assistive, not a warrant system.
          </p>
        </article>
        <article className="panel">
          <h3>What we are not</h3>
          <p className="muted">
            Not the county, not police, not the court. Not title. Not eviction. Not a public shame
            list. County recording and the courts remain authoritative.
          </p>
        </article>
      </div>
    </section>
  );
}
