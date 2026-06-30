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
        <h2>Checking your session</h2>
        <p>Hang on while we confirm whether you can reopen this screen.</p>
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
