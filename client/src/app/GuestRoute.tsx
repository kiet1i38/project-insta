import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthSession } from "../modules/auth/authSessionContext";

export function GuestRoute() {
  const location = useLocation();
  const { status } = useAuthSession();
  const redirectTo =
    typeof location.state?.from === "string" && location.state.from.length > 0
      ? location.state.from
      : "/";

  if (status === "bootstrapping") {
    return (
      <section className="panel route-gate-panel">
        <p className="eyebrow">Restoring session</p>
        <h2>Checking your session</h2>
        <p>Hang on while we decide whether to reopen the app or keep you here.</p>
      </section>
    );
  }

  if (status === "authenticated") {
    return <Navigate replace to={redirectTo} />;
  }

  return <Outlet />;
}
