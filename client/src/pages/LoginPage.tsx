import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearNextAuthNotice } from "../app/authRouteNotice";
import { ApiError } from "../modules/auth/authApi";
import { useAuthSession } from "../modules/auth/authSessionContext";
import {
  initialLoginValues,
  validateLoginForm,
  type LoginFormErrors,
  type LoginFormValues
} from "./authValidation";

type LoginPageLocationState = {
  from?: string;
  identifier?: string;
  notice?: string;
};

export function LoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuthSession();
  const locationState = location.state as LoginPageLocationState | null;
  const [values, setValues] = useState<LoginFormValues>(() => ({
    ...initialLoginValues,
    identifier: locationState?.identifier ?? initialLoginValues.identifier
  }));
  const [errors, setErrors] = useState<LoginFormErrors>({});
  const [formMessage, setFormMessage] = useState<{
    text: string;
    tone: "error" | "info";
  } | null>(
    locationState?.notice
      ? {
          text: locationState.notice,
          tone: "info"
        }
      : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const redirectTo =
    typeof locationState?.from === "string" && locationState.from.length > 0
      ? locationState.from
      : "/";

  useEffect(() => {
    clearNextAuthNotice();
  }, []);

  function updateField(field: keyof LoginFormValues, value: string) {
    setValues((current) => ({
      ...current,
      [field]: value
    }));
    setFormMessage(null);
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateLoginForm(values);

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setFormMessage(null);
    setIsSubmitting(true);

    try {
      await login(values);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      setFormMessage({
        text:
          error instanceof ApiError
            ? error.message
            : "Could not log in right now. Please try again.",
        tone: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel auth-page">
      <div className="auth-copy">
        <p className="eyebrow">Slice 4C</p>
        <h2>Log back into your photo-sharing workspace</h2>
        <p>
          Protected pages now send guests here. Submit valid credentials to
          reopen the feed, keep the access token in memory, and let the refresh
          cookie rebuild the session after reload.
        </p>
      </div>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <label className="form-field" htmlFor="login-identifier">
          <span>Email or username</span>
          <input
            id="login-identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            value={values.identifier}
            onChange={(event) => updateField("identifier", event.target.value)}
            aria-invalid={errors.identifier ? "true" : "false"}
            aria-describedby={
              errors.identifier ? "login-identifier-error" : undefined
            }
          />
          {errors.identifier ? (
            <small className="field-error" id="login-identifier-error">
              {errors.identifier}
            </small>
          ) : null}
        </label>

        <label className="form-field" htmlFor="login-password">
          <span>Password</span>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={values.password}
            onChange={(event) => updateField("password", event.target.value)}
            aria-invalid={errors.password ? "true" : "false"}
            aria-describedby={
              errors.password ? "login-password-error" : undefined
            }
          />
          {errors.password ? (
            <small className="field-error" id="login-password-error">
              {errors.password}
            </small>
          ) : null}
        </label>

        <div className="auth-actions">
          {formMessage ? (
            <p className="form-status" data-tone={formMessage.tone} role="status">
              {formMessage.text}
            </p>
          ) : null}
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in..." : "Log in"}
          </button>
          <p className="auth-link-row">
            New here? <Link to="/register">Create an account</Link>
          </p>
        </div>
      </form>
    </section>
  );
}
