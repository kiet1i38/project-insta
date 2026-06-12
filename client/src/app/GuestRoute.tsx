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
        <h2>Checking whether a saved session should skip the guest screens</h2>
        <p>
          Login and register stay on hold until the refresh-cookie bootstrap
          finishes, so authenticated users do not flash the guest forms.
        </p>
      </section>
    );
  }

  if (status === "authenticated") {
    return <Navigate replace to={redirectTo} />;
  }

  return <Outlet />;
}
