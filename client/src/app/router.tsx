import { Route, Routes } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { FeedPage } from "../pages/FeedPage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { RegisterPage } from "../pages/RegisterPage";
import { GuestRoute } from "./GuestRoute";
import { ProtectedRoute } from "./ProtectedRoute";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />} path="/">
        <Route element={<ProtectedRoute />}>
          <Route element={<FeedPage />} index />
        </Route>
        <Route element={<GuestRoute />}>
          <Route element={<LoginPage />} path="login" />
          <Route element={<RegisterPage />} path="register" />
        </Route>
      </Route>
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}
