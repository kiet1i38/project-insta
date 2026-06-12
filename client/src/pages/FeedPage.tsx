import { useAuthSession } from "../modules/auth/authSessionContext";

export function FeedPage() {
  const { user } = useAuthSession();

  return (
    <section className="panel">
      <p className="eyebrow">Slice 4C</p>
      <h2>Protected feed shell with logout flow</h2>
      <p>
        This screen now sits behind a protected route, so guests are redirected
        to login while authenticated users keep the in-memory access token and
        can end the backend session through the logout flow.
      </p>
      <div className="card-grid">
        <article className="mini-card">
          <h3>Session guard</h3>
          <p>
            {user
              ? `Protected content is open for ${user.displayName} (@${user.username}).`
              : "This page should render only after the session store confirms an authenticated user."}
          </p>
        </article>
        <article className="mini-card">
          <h3>Next slice</h3>
          <p>Profile read/update and user-safe DTO wiring can now build on top of the guarded session layer.</p>
        </article>
      </div>
    </section>
  );
}
