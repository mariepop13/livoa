import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "../../src/app/page";

test("renders the Livoa heading", () => {
  render(<Home />);

  expect(screen.getByRole("heading", { name: "Livoa" })).toBeVisible();
});
