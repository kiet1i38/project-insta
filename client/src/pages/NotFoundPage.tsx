import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="panel">
      <p className="eyebrow">404</p>
      <h2>Page not found</h2>
      <p>The requested route is not part of the current skeleton yet.</p>
      <Link className="button-link" to="/">
        Back to the feed shell
      </Link>
    </section>
  );
}
