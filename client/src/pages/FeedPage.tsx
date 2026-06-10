export function FeedPage() {
  return (
    <section className="panel">
      <p className="eyebrow">Slice 1C</p>
      <h2>Frontend walking skeleton</h2>
      <p>
        The client is bootstrapped with React, Vite, TypeScript, and routing so
        we can wire auth and feed features without redoing the project shape.
      </p>
      <div className="card-grid">
        <article className="mini-card">
          <h3>Ready now</h3>
          <p>Routing shell, build pipeline, and test harness.</p>
        </article>
        <article className="mini-card">
          <h3>Next slice</h3>
          <p>Connect the client to the auth backend and protect routes.</p>
        </article>
      </div>
    </section>
  );
}
