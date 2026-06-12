import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSessionProvider } from "../modules/auth/authSession";
import { LoginPage } from "./LoginPage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}

function renderLoginPage() {
  return render(
    <AuthSessionProvider>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/" element={<div>Feed destination</div>} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    </AuthSessionProvider>
  );
}

afterEach(() => {
  document.cookie =
    "cloneinsta_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  vi.restoreAllMocks();
});

describe("LoginPage", () => {
  it("shows required-field errors when the guest submits an empty form", async () => {
    const user = userEvent.setup();

    renderLoginPage();

    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(
      screen.getByText(/email or username is required\./i)
    ).toBeInTheDocument();
    expect(screen.getByText(/password is required\./i)).toBeInTheDocument();
  });

  it("shows the backend auth error after a valid submit fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "AUTH_INVALID_CREDENTIALS",
            message: "Invalid credentials."
          },
          requestId: "req-login-error"
        },
        401
      )
    );

    renderLoginPage();

    await user.type(
      screen.getByLabelText(/email or username/i),
      "student@example.com"
    );
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /invalid credentials\./i
    );
  });

  it("navigates to the feed destination after a successful login", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        accessToken: "access-token-123",
        requestId: "req-login-success",
        user: {
          createdAt: "2026-06-12T10:00:00.000Z",
          displayName: "Student Demo",
          email: "student.demo@example.com",
          id: "user-123",
          role: "USER",
          status: "ACTIVE",
          updatedAt: "2026-06-12T10:00:00.000Z",
          username: "student_demo"
        }
      })
    );

    renderLoginPage();

    await user.type(
      screen.getByLabelText(/email or username/i),
      "student.demo@example.com"
    );
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/feed destination/i)).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/auth/login",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    );
  });
});
