import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarkdownPreview } from "./MarkdownPreview";

afterEach(cleanup);

it("shows and updates a rendered table in Preview instead of pipe-delimited source", () => {
  const source = "| Item | Value |\n| :--- | ---: |\n| Note | **42** |";
  const onLinkError = vi.fn();
  const { rerender } = render(
    <MarkdownPreview content={source} onLinkError={onLinkError} />,
  );
  const region = screen.getByRole("region", { name: "Markdown table" });
  expect(region).toHaveAttribute("tabindex", "0");
  expect(screen.getByRole("table")).toBeTruthy();
  expect(screen.getByRole("columnheader", { name: "Value" })).toHaveAttribute(
    "align",
    "right",
  );
  expect(
    screen.getByRole("cell", { name: "42" }).querySelector("strong"),
  ).toBeTruthy();
  rerender(
    <MarkdownPreview
      content={source.replace("42", "43")}
      onLinkError={onLinkError}
    />,
  );
  expect(screen.queryByRole("cell", { name: "42" })).toBeNull();
  expect(screen.getByRole("cell", { name: "43" })).toBeTruthy();
});
