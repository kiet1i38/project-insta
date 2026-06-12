import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthSessionProvider } from "../modules/auth/authSession";
import { LoginPage } from "./LoginPage";
import { RegisterPage } from "./RegisterPage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json"
    },
    status
  });
}

function renderRegisterPage() {
  return render(
    <AuthSessionProvider>
      <MemoryRouter initialEntries={["/register"]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
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

describe("RegisterPage", () => {
  it("shows backend-aligned validation errors for invalid register input", async () => {
    const user = userEvent.setup();

    renderRegisterPage();

    await user.type(screen.getByLabelText(/display name/i), "  ");
    await user.type(screen.getByLabelText(/^username$/i), "Bad-Name");
    await user.type(screen.getByLabelText(/^email$/i), "not-an-email");
    await user.type(screen.getByLabelText(/^password$/i), "weakpass");
    await user.type(
      screen.getByLabelText(/confirm password/i),
      "Different123!"
    );
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(screen.getByText(/display name is required\./i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /username may contain only lowercase letters, numbers, dots, and underscores\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/email must be valid\./i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /password must include at least one lowercase letter, one uppercase letter, and one number\./i
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/passwords do not match\./i)).toBeInTheDocument();
  });

  it("shows the backend duplicate error after a valid submit fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "AUTH_EMAIL_IN_USE",
            message: "Email is already in use."
          },
          requestId: "req-register-error"
        },
        409
      )
    );

    renderRegisterPage();

    await user.type(screen.getByLabelText(/display name/i), "Student Demo");
    await user.type(screen.getByLabelText(/^username$/i), "student_demo");
    await user.type(
      screen.getByLabelText(/^email$/i),
      "student.demo@example.com"
    );
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.type(
      screen.getByLabelText(/confirm password/i),
      "Password123!"
    );
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /email is already in use\./i
    );
  });

  it("redirects to login with a success note and prefilled identifier after a successful register", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          requestId: "req-register-success",
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
        },
        201
      )
    );

    renderRegisterPage();

    await user.type(screen.getByLabelText(/display name/i), "Student Demo");
    await user.type(screen.getByLabelText(/^username$/i), "student_demo");
    await user.type(
      screen.getByLabelText(/^email$/i),
      "student.demo@example.com"
    );
    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.type(
      screen.getByLabelText(/confirm password/i),
      "Password123!"
    );
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByRole("heading", {
        name: /log back into your photo-sharing workspace/i
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /account created\. log in to continue\./i
    );
    expect(screen.getByLabelText(/email or username/i)).toHaveValue(
      "student.demo@example.com"
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:3001/api/v1/auth/register",
      expect.objectContaining({
        credentials: "include",
        method: "POST"
      })
    );
  });
});
