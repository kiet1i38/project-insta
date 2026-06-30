import { AdminRoute } from "./AdminRoute";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { AuditLogPage } from "../pages/AuditLogPage";
import { CreatePostPage } from "../pages/CreatePostPage";
import { EditProfilePage } from "../pages/EditProfilePage";
import { FeedPage } from "../pages/FeedPage";
import { LoginPage } from "../pages/LoginPage";
import { ModerationQueuePage } from "../pages/ModerationQueuePage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { ProfilePage } from "../pages/ProfilePage";
import { RegisterPage } from "../pages/RegisterPage";
import { SearchPage } from "../pages/SearchPage";
import { GuestRoute } from "./GuestRoute";
import { ProtectedRoute } from "./ProtectedRoute";

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />} path="/">
        <Route element={<ProtectedRoute />}>
          <Route element={<FeedPage />} index />
          <Route element={<CreatePostPage />} path="create" />
          <Route element={<ProfilePage />} path="profile" />
          <Route element={<EditProfilePage />} path="profile/edit" />
          <Route element={<SearchPage />} path="search" />
          <Route element={<AdminRoute />}>
            <Route element={<ModerationQueuePage />} path="admin/reports" />
            <Route element={<AuditLogPage />} path="admin/audit-logs" />
          </Route>
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
