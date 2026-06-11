import { AUTH_INVALID_CREDENTIALS_MESSAGE } from "./auth.errors.js";
import { loginSchema, registerSchema } from "./auth.schema.js";
import { hashPassword, verifyPassword } from "./password.js";

describe("registerSchema", () => {
  test("normalizes register input and strips confirmPassword from parsed output", () => {
    const result = registerSchema.safeParse({
      displayName: "  Alice Demo  ",
      username: "  Alice_Demo  ",
      email: "  Alice.Demo@Example.COM  ",
      password: "Password123!",
      confirmPassword: "Password123!"
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      displayName: "Alice Demo",
      username: "alice_demo",
      email: "alice.demo@example.com",
      password: "Password123!"
    });
  });

  test("rejects reserved or unsupported usernames", () => {
    const reservedUsernameResult = registerSchema.safeParse({
      displayName: "Admin Clone",
      username: "admin",
      email: "admin@example.com",
      password: "Password123!",
      confirmPassword: "Password123!"
    });

    const invalidCharactersResult = registerSchema.safeParse({
      displayName: "Emoji Clone",
      username: "xin-chao",
      email: "emoji@example.com",
      password: "Password123!",
      confirmPassword: "Password123!"
    });

    expect(reservedUsernameResult.success).toBe(false);
    expect(invalidCharactersResult.success).toBe(false);
  });

  test("rejects weak or bcrypt-unsafe passwords", () => {
    const weakPasswordResult = registerSchema.safeParse({
      displayName: "Weak Password",
      username: "weak_password",
      email: "weak@example.com",
      password: "password",
      confirmPassword: "password"
    });

    const tooLongPasswordResult = registerSchema.safeParse({
      displayName: "Long Password",
      username: "long_password",
      email: "long@example.com",
      password: "A1!" + "a".repeat(70),
      confirmPassword: "A1!" + "a".repeat(70)
    });

    expect(weakPasswordResult.success).toBe(false);
    expect(tooLongPasswordResult.success).toBe(false);
  });
});

describe("loginSchema", () => {
  test("normalizes identifier casing and trims outer whitespace without altering password", () => {
    const result = loginSchema.safeParse({
      identifier: "  Alice_Demo  ",
      password: " Password123! "
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      identifier: "alice_demo",
      password: " Password123! "
    });
  });
});

describe("password helpers", () => {
  test("hashes plain passwords and verifies them safely", async () => {
    const password = "Password123!";
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.startsWith("$2")).toBe(true);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("WrongPassword123!", hash)).resolves.toBe(false);
  });
});

describe("auth errors", () => {
  test("keeps login failure messages generic", () => {
    expect(AUTH_INVALID_CREDENTIALS_MESSAGE).toBe("Invalid credentials.");
  });
});
