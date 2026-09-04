import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import MarkdownMessage from "./markdown-message";

describe("MarkdownMessage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders GitHub-flavored Markdown elements", () => {
    render(
      <MarkdownMessage
        content={`# Heading

Paragraph with **bold**, *emphasis*, and \`inline code\`.

- First item
- Second item

1. First ordered item
2. Second ordered item

> A quoted line.

[Safe link](https://example.com)

\`\`\`ts
const greeting = "hello";
console.log(greeting);
\`\`\``}
      />,
    );

    expect(screen.getByRole("heading", { name: "Heading" })).toBeVisible();
    expect(screen.getByText("bold").tagName).toBe("STRONG");
    expect(screen.getByText("emphasis").tagName).toBe("EM");
    expect(screen.getByText("inline code").tagName).toBe("CODE");
    expect(screen.getAllByRole("list")[0]).toHaveTextContent("First item");
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(
      screen.getByText("A quoted line.").closest("blockquote"),
    ).not.toBeNull();

    const link = screen.getByRole("link", { name: "Safe link" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    const codeBlock = screen
      .getByText(
        (_, element) =>
          element?.tagName === "CODE" &&
          element.textContent ===
            'const greeting = "hello";\nconsole.log(greeting);\n',
      )
      .closest("pre");
    expect(codeBlock?.textContent).toBe(
      'const greeting = "hello";\nconsole.log(greeting);\n',
    );
  });

  it("keeps ordinary text visually pre-wrapped", () => {
    render(<MarkdownMessage content={"First line\nSecond line"} />);

    const paragraph = screen.getByText(
      (_, element) =>
        element?.tagName === "P" &&
        element.textContent === "First line\nSecond line",
    );
    expect(paragraph).toHaveClass("whitespace-pre-wrap");
    expect(paragraph.textContent).toBe("First line\nSecond line");
  });

  it("preserves ordered-list start values", () => {
    render(<MarkdownMessage content={"3. Third step\n4. Fourth step"} />);

    expect(screen.getByRole("list")).toHaveAttribute("start", "3");
  });

  it("preserves internal GFM footnote links", () => {
    const { container } = render(
      <MarkdownMessage
        content={"A footnote reference.[^note]\n\n[^note]: Footnote details."}
      />,
    );

    const footnoteReference = container.querySelector<HTMLAnchorElement>(
      "a[data-footnote-ref]",
    );
    expect(footnoteReference?.getAttribute("href")).toMatch(/^#/);
    expect(footnoteReference?.hasAttribute("data-footnote-ref")).toBe(true);
    expect(footnoteReference).not.toHaveAttribute("target");
  });

  it("keeps raw HTML inert and rejects JavaScript URLs", () => {
    const { container } = render(
      <MarkdownMessage
        content={
          '<img src=x onerror="window.__xss = true">\n\n<script>window.__xss = true</script>\n\n[Unsafe link](javascript:alert(1))'
        }
      />,
    );

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/<img src=x/)).toBeVisible();
    expect(screen.getByText(/<script>/)).toBeVisible();

    expect(screen.queryByRole("link", { name: "Unsafe link" })).toBeNull();
  });
});
