import { Navigate, Outlet } from "react-router-dom";
import { useAuthSession } from "../modules/auth/authSessionContext";

export function GuestRoute() {
  const { status } = useAuthSession();

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
    return <Navigate replace to="/" />;
  }

  return <Outlet />;
}
