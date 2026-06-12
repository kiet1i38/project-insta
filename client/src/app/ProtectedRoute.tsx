import { Navigate, Outlet, useLocation } from "react-router-dom";
import { readNextAuthNotice } from "./authRouteNotice";
import { useAuthSession } from "../modules/auth/authSessionContext";

export function ProtectedRoute() {
  const location = useLocation();
  const { status } = useAuthSession();

  if (status === "bootstrapping") {
    return (
      <section className="panel route-gate-panel">
        <p className="eyebrow">Restoring session</p>
        <h2>Checking whether this protected screen can be reopened safely</h2>
        <p>
          The client waits for the refresh-cookie flow before deciding whether
          to show the feed or redirect the guest back to login.
        </p>
      </section>
    );
  }

  if (status !== "authenticated") {
    const from = `${location.pathname}${location.search}${location.hash}`;
    const notice = readNextAuthNotice() ?? "Log in to continue.";

    return (
      <Navigate
        replace
        state={{
          from,
          notice
        }}
        to="/login"
      />
    );
  }

  return <Outlet />;
}
