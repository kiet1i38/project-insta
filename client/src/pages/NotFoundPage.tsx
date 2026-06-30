import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <section className="panel">
      <p className="eyebrow">404</p>
      <h2>Page not found</h2>
      <p>This page is not available in the current workspace.</p>
      <Link className="button-link" to="/">
        Back to the feed
      </Link>
    </section>
  );
}
