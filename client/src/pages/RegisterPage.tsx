import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../modules/auth/authApi";
import { useAuthSession } from "../modules/auth/authSessionContext";
import {
  initialRegisterValues,
  validateRegisterForm,
  type RegisterFormErrors,
  type RegisterFormValues
} from "./authValidation";

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuthSession();
  const [values, setValues] =
    useState<RegisterFormValues>(initialRegisterValues);
  const [errors, setErrors] = useState<RegisterFormErrors>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof RegisterFormValues, value: string) {
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
    const nextErrors = validateRegisterForm(values);

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setFormMessage(null);
    setIsSubmitting(true);

    try {
      await register(values);
      navigate("/login", {
        replace: true,
        state: {
          identifier: values.email,
          notice: "Account created. Log in to continue."
        }
      });
    } catch (error) {
      setFormMessage(
        error instanceof ApiError
          ? error.message
          : "Could not create the account right now. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel auth-page">
      <div className="auth-copy">
        <p className="eyebrow">Slice 4C</p>
        <h2>Create your CloneInsta account</h2>
        <p>
          This register screen now posts to the real backend contract and then
          sends the new user to the protected-login flow with their identifier
          prefilled.
        </p>
      </div>

      <form className="auth-form" noValidate onSubmit={handleSubmit}>
        <label className="form-field" htmlFor="register-display-name">
          <span>Display name</span>
          <input
            id="register-display-name"
            name="displayName"
            type="text"
            autoComplete="name"
            value={values.displayName}
            onChange={(event) => updateField("displayName", event.target.value)}
            aria-invalid={errors.displayName ? "true" : "false"}
            aria-describedby={
              errors.displayName ? "register-display-name-error" : undefined
            }
          />
          {errors.displayName ? (
            <small className="field-error" id="register-display-name-error">
              {errors.displayName}
            </small>
          ) : null}
        </label>

        <label className="form-field" htmlFor="register-username">
          <span>Username</span>
          <input
            id="register-username"
            name="username"
            type="text"
            autoComplete="username"
            value={values.username}
            onChange={(event) => updateField("username", event.target.value)}
            aria-invalid={errors.username ? "true" : "false"}
            aria-describedby={
              errors.username ? "register-username-error" : undefined
            }
          />
          {errors.username ? (
            <small className="field-error" id="register-username-error">
              {errors.username}
            </small>
          ) : null}
        </label>

        <label className="form-field" htmlFor="register-email">
          <span>Email</span>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => updateField("email", event.target.value)}
            aria-invalid={errors.email ? "true" : "false"}
            aria-describedby={
              errors.email ? "register-email-error" : undefined
            }
          />
          {errors.email ? (
            <small className="field-error" id="register-email-error">
              {errors.email}
            </small>
          ) : null}
        </label>

        <label className="form-field" htmlFor="register-password">
          <span>Password</span>
          <input
            id="register-password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(event) => updateField("password", event.target.value)}
            aria-invalid={errors.password ? "true" : "false"}
            aria-describedby={
              errors.password ? "register-password-error" : undefined
            }
          />
          {errors.password ? (
            <small className="field-error" id="register-password-error">
              {errors.password}
            </small>
          ) : null}
        </label>

        <label className="form-field" htmlFor="register-confirm-password">
          <span>Confirm password</span>
          <input
            id="register-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={values.confirmPassword}
            onChange={(event) =>
              updateField("confirmPassword", event.target.value)
            }
            aria-invalid={errors.confirmPassword ? "true" : "false"}
            aria-describedby={
              errors.confirmPassword
                ? "register-confirm-password-error"
                : undefined
            }
          />
          {errors.confirmPassword ? (
            <small
              className="field-error"
              id="register-confirm-password-error"
            >
              {errors.confirmPassword}
            </small>
          ) : null}
        </label>

        <div className="auth-actions">
          {formMessage ? (
            <p className="form-status" data-tone="error" role="status">
              {formMessage}
            </p>
          ) : null}
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
          <p className="auth-link-row">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </form>
    </section>
  );
}
