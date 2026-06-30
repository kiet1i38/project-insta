import { Link, Outlet } from "react-router-dom";
import { useAuthSession } from "../modules/auth/authSessionContext";

export function AdminRoute() {
  const { status, user } = useAuthSession();

  if (status === "bootstrapping") {
    return (
      <section className="panel route-gate-panel">
        <p className="eyebrow">Restoring session</p>
        <h2>Checking admin access</h2>
        <p>Hang on while we confirm that this workspace can open admin tools.</p>
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
