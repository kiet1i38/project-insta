import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ApiError } from "../modules/auth/authApi";
import { useAuthSession } from "../modules/auth/authSessionContext";

export function AppShell() {
  const { logout, status, user } = useAuthSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);
  const navItems =
    status === "authenticated"
      ? [
          { to: "/", label: "Feed" },
          { to: "/profile", label: "Profile" },
          { to: "/search", label: "Search" }
        ]
      : [
          { to: "/", label: "Feed" },
          { to: "/login", label: "Login" },
          { to: "/register", label: "Register" }
        ];
  const adminNavItems =
    status === "authenticated" && user?.role === "ADMIN"
      ? [
          { to: "/admin/reports", label: "Moderation" },
          { to: "/admin/audit-logs", label: "Audit log" }
        ]
      : [];

  const sessionSummary =
    status === "bootstrapping"
      ? {
          title: "Restoring saved session",
          body: "Checking whether a refresh cookie can mint a fresh access token."
        }
      : status === "authenticated" && user?.role === "ADMIN"
        ? {
            title: `Admin session for @${user.username}`,
            body: "This account can open the moderation queue and audit log routes in addition to the normal product shell."
          }
      : status === "authenticated" && user
        ? {
            title: `Signed in as @${user.username}`,
            body: "Protected client routes now rely on the shared session store, while logout revokes the refresh-cookie session on the backend."
          }
        : {
            title: "Guest session",
            body: "Protected pages now redirect guests to login until a real session is restored."
          };

  async function handleLogout(): Promise<void> {
    setLogoutMessage(null);
    setIsLoggingOut(true);

    try {
      await logout({
        notice: "You have logged out."
      });
    } catch (error) {
      setLogoutMessage(
        error instanceof ApiError
          ? error.message
          : "Could not log out right now. Please try again."
      );
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">CloneInsta</p>
          <h1>Build your original social app</h1>
          <p className="lede">
            Local-first client shell with guarded auth routes, backend-backed
            logout, and in-memory access tokens.
          </p>
        </div>

        <nav className="nav">
          <div className="nav-section">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? "nav-link nav-link-active" : "nav-link"
                }
                end={item.to === "/"}
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          {adminNavItems.length > 0 ? (
            <div className="nav-section">
              <p className="nav-section-label">Admin tools</p>
              {adminNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive ? "nav-link nav-link-active" : "nav-link"
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ) : null}
        </nav>

        <section className="session-card" aria-live="polite">
          <p className="eyebrow">Session</p>
          <h2 className="session-title">{sessionSummary.title}</h2>
          <p className="session-copy">{sessionSummary.body}</p>
          {logoutMessage ? (
            <p className="session-status" role="status">
              {logoutMessage}
            </p>
          ) : null}
          {status === "authenticated" ? (
            <button
              className="secondary-button"
              disabled={isLoggingOut}
              onClick={() => void handleLogout()}
              type="button"
            >
              {isLoggingOut ? "Logging out..." : "Log out"}
            </button>
          ) : null}
        </section>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
