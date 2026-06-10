import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("shows the starter shell heading", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /build your original social app/i })
    ).toBeInTheDocument();
  });
});
