import { Link, Outlet } from "react-router-dom";
import { useAuthSession } from "../modules/auth/authSessionContext";

export function AdminRoute() {
  const { status, user } = useAuthSession();

  if (status === "bootstrapping") {
    return (
      <section className="panel route-gate-panel">
        <p className="eyebrow">Restoring session</p>
        <h2>Checking whether this admin area can be reopened safely</h2>
        <p>
          The client waits for the shared auth bootstrap before deciding whether
          moderation tools should be unlocked.
        </p>
      </section>
    );
  }

  if (status !== "authenticated" || !user) {
    return null;
  }

  if (user.role !== "ADMIN") {
    return (
      <section className="panel route-gate-panel">
        <p className="eyebrow">Admin only</p>
        <h2>Admin access required</h2>
        <p>
          This area is reserved for current admin accounts. Use the main social
          routes for normal profile, feed, and search work.
        </p>
        <Link className="button-link-inline secondary-inline-link" to="/">
          Return to feed
        </Link>
      </section>
    );
  }

  return <Outlet />;
}
