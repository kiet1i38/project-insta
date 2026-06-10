import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "../layouts/AppShell";
import { FeedPage } from "../pages/FeedPage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";

export const appRouter = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <FeedPage />
      },
      {
        path: "login",
        element: <LoginPage />
      }
    ]
  },
  {
    path: "*",
    element: <NotFoundPage />
  }
]);
