import type { ComponentType } from "react";
import { useState } from "react";
import {
  IconFileText,
  IconHome2,
  IconLogout2,
  IconPlus,
  IconSearch,
  IconShield,
  IconUserCircle
} from "@tabler/icons-react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ApiError } from "../modules/auth/authApi";
import { useAuthSession } from "../modules/auth/authSessionContext";

type ShellNavItem = {
  end?: boolean;
  icon: ComponentType<{
    className?: string;
    size?: number | string;
    stroke?: number | string;
  }>;
  label: string;
  to: string;
};

export function AppShell() {
  const location = useLocation();
  const { logout, status, user } = useAuthSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutMessage, setLogoutMessage] = useState<string | null>(null);
  const isAuthPage =
    location.pathname === "/login" || location.pathname === "/register";
  const primaryNavItems: ShellNavItem[] =
    status === "authenticated"
      ? [
          { to: "/", label: "Home", icon: IconHome2, end: true },
          { to: "/create", label: "Create", icon: IconPlus },
          { to: "/search", label: "Search", icon: IconSearch },
          { to: "/profile", label: "Profile", icon: IconUserCircle }
        ]
      : [];
  const adminNavItems: ShellNavItem[] =
    status === "authenticated" && user?.role === "ADMIN"
      ? [
          { to: "/admin/reports", label: "Moderation", icon: IconShield },
          { to: "/admin/audit-logs", label: "Audit log", icon: IconFileText }
        ]
      : [];
  const mobileNavItems: ShellNavItem[] =
    status === "authenticated"
      ? [
          ...primaryNavItems,
          ...(user?.role === "ADMIN"
            ? [{ to: "/admin/reports", label: "Admin", icon: IconShield }]
            : [])
        ]
      : [];

  const sessionSummary =
    status === "bootstrapping"
      ? {
          title: "Restoring session",
          body: "Checking whether a saved session is ready to reopen the app."
        }
      : status === "authenticated" && user?.role === "ADMIN"
        ? {
          title: `Admin session for @${user.username}`,
          body: "Moderation and audit routes stay available from this shared workspace."
        }
      : status === "authenticated" && user
        ? {
          title: `Signed in as @${user.username}`,
          body: "Your feed, search, and profile stay in one light social workspace."
        }
        : {
          title: "Guest session",
          body: "Sign in to unlock the protected social experience."
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

  if (isAuthPage) {
    return (
      <div className="app-shell app-shell-auth">
        <main className="content content-auth">
          <div className="content-auth-inner">
            <div className="auth-shell-brand">
              <Link className="auth-shell-brand-title" to="/">
                CloneInsta
              </Link>
              <p className="auth-shell-brand-subtitle">Premium Social</p>
            </div>
            <Outlet />
          </div>
        </main>
        <footer className="auth-shell-footer" aria-label="Project footer">
          <span>Terms</span>
          <span>Privacy</span>
          <span>Help</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="shell-sidebar">
        <div className="shell-brand">
          <Link className="shell-brand-title" to="/">
            CloneInsta
          </Link>
          <p className="shell-brand-subtitle">Premium Social</p>
        </div>

        <nav className="shell-nav" aria-label="Primary navigation">
          <div className="shell-nav-group shell-nav-group-primary">
            {primaryNavItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    isActive
                      ? "shell-nav-link shell-nav-link-active"
                      : "shell-nav-link"
                  }
                  end={item.end}
                >
                  <Icon aria-hidden="true" className="shell-nav-icon" size={22} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>

          {adminNavItems.length > 0 ? (
            <div className="shell-nav-group shell-nav-group-admin">
              <p className="shell-nav-section-title">Admin tools</p>
              {adminNavItems.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      isActive
                        ? "shell-nav-link shell-nav-link-active"
                        : "shell-nav-link"
                    }
                  >
                    <Icon aria-hidden="true" className="shell-nav-icon" size={22} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ) : null}
        </nav>

        <section className="shell-session" aria-live="polite">
          <div className="shell-session-head">
            <div aria-hidden="true" className="shell-session-avatar">
              {user?.username.slice(0, 1).toUpperCase() ?? "G"}
            </div>
            <div>
              <p className="shell-session-title">{sessionSummary.title}</p>
              <p className="shell-session-copy">{sessionSummary.body}</p>
            </div>
          </div>
          {status === "authenticated" && user ? (
            <div className="shell-session-actions">
              <span className="shell-session-role">{user.role}</span>
              <Link className="shell-session-link" to="/profile/edit">
                Profile settings
              </Link>
            </div>
          ) : null}
          {logoutMessage ? (
            <p className="shell-session-status" role="status">
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
              <IconLogout2 aria-hidden="true" size={18} />
              <span>{isLoggingOut ? "Logging out..." : "Log out"}</span>
            </button>
          ) : null}
        </section>
      </aside>

      <main className="content">
        <div className="content-inner">
          <Outlet />
        </div>
      </main>

      {mobileNavItems.length > 0 ? (
        <nav className="shell-mobile-nav" aria-label="Mobile navigation">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                aria-label={`${item.label} tab`}
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive
                    ? "shell-mobile-link shell-mobile-link-active"
                    : "shell-mobile-link"
                }
                end={item.end}
              >
                <Icon aria-hidden="true" className="shell-mobile-icon" size={20} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
