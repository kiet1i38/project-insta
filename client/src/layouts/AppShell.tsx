import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Feed" },
  { to: "/login", label: "Login" }
];

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">CloneInsta</p>
          <h1>Build your original social app</h1>
          <p className="lede">
            This walking skeleton keeps the app original, local-first, and ready
            for the next auth slice.
          </p>
        </div>

        <nav className="nav">
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
        </nav>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
