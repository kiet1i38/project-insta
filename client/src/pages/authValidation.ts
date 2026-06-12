const reservedUsernames = new Set([
  "admin",
  "api",
  "login",
  "moderator",
  "support"
]);

const usernamePattern = /^[a-z0-9._]+$/;
const passwordComplexityPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginFormValues = {
  identifier: string;
  password: string;
};

export type RegisterFormValues = {
  displayName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type LoginFormErrors = Partial<Record<keyof LoginFormValues, string>>;
export type RegisterFormErrors = Partial<Record<keyof RegisterFormValues, string>>;

export const initialLoginValues: LoginFormValues = {
  identifier: "",
  password: ""
};

export const initialRegisterValues: RegisterFormValues = {
  displayName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: ""
};

export function validateLoginForm(values: LoginFormValues): LoginFormErrors {
  const errors: LoginFormErrors = {};

  if (!values.identifier.trim()) {
    errors.identifier = "Email or username is required.";
  } else if (values.identifier.trim().length > 254) {
    errors.identifier = "Email or username is too long.";
  }

  if (!values.password) {
    errors.password = "Password is required.";
  } else if (values.password.length > 72) {
    errors.password = "Password must be 72 characters or fewer.";
  }

  return errors;
}

export function validateRegisterForm(
  values: RegisterFormValues
): RegisterFormErrors {
  const errors: RegisterFormErrors = {};
  const displayName = values.displayName.trim();
  const username = values.username.trim().toLowerCase();
  const email = values.email.trim().toLowerCase();

  if (!displayName) {
    errors.displayName = "Display name is required.";
  } else if (displayName.length > 50) {
    errors.displayName = "Display name must be 50 characters or fewer.";
  }

  if (username.length < 3) {
    errors.username = "Username must be at least 3 characters.";
  } else if (username.length > 30) {
    errors.username = "Username must be 30 characters or fewer.";
  } else if (!usernamePattern.test(username)) {
    errors.username =
      "Username may contain only lowercase letters, numbers, dots, and underscores.";
  } else if (reservedUsernames.has(username)) {
    errors.username = "Username is reserved.";
  }

  if (!emailPattern.test(email)) {
    errors.email = "Email must be valid.";
  }

  if (values.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  } else if (values.password.length > 72) {
    errors.password = "Password must be 72 characters or fewer.";
  } else if (!passwordComplexityPattern.test(values.password)) {
    errors.password =
      "Password must include at least one lowercase letter, one uppercase letter, and one number.";
  }

  if (values.password !== values.confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  return errors;
}
