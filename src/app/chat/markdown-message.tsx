import { useDeferredValue, useMemo } from "react";

import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import remarkGfm from "remark-gfm";

function safeUrlTransform(url: string): string | undefined {
  const transformedUrl = defaultUrlTransform(url);

  return transformedUrl.length > 0 ? transformedUrl : undefined;
}

function isExternalUrl(url: string): boolean {
  const localOrigin = "https://livoa.invalid";

  try {
    return new URL(url, localOrigin).origin !== localOrigin;
  } catch {
    return false;
  }
}

const markdownComponents: Components = {
  a({ children, href, node, ...props }) {
    void node;

    if (href === undefined) {
      return <span>{children}</span>;
    }

    const external = isExternalUrl(href);

    return (
      <a
        {...props}
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="mt-2 border-l-4 border-cyan-400/50 pl-4 text-slate-300">
        {children}
      </blockquote>
    );
  },
  code({ children, className }) {
    return (
      <code
        className={`rounded bg-slate-950 px-1.5 py-0.5 font-mono text-sm text-slate-100 ${className ?? ""}`}
      >
        {children}
      </code>
    );
  },
  h1({ children }) {
    return <h1 className="mt-4 text-xl font-bold">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mt-4 text-lg font-bold">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mt-3 text-base font-bold">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="mt-3 text-base font-semibold">{children}</h4>;
  },
  h5({ children }) {
    return <h5 className="mt-3 text-sm font-semibold">{children}</h5>;
  },
  h6({ children }) {
    return <h6 className="mt-3 text-sm font-semibold">{children}</h6>;
  },
  li({ children }) {
    return <li className="pl-1">{children}</li>;
  },
  ol({ children, start }) {
    return (
      <ol start={start} className="mt-2 list-decimal space-y-1 pl-6">
        {children}
      </ol>
    );
  },
  p({ children }) {
    return (
      <p className="mt-2 whitespace-pre-wrap leading-7 text-slate-100">
        {children}
      </p>
    );
  },
  pre({ children }) {
    return (
      <pre className="mt-2 max-w-full overflow-x-auto rounded bg-slate-950 p-3 leading-6">
        {children}
      </pre>
    );
  },
  ul({ children }) {
    return <ul className="mt-2 list-disc space-y-1 pl-6">{children}</ul>;
  },
};

type MarkdownMessageProps = Readonly<{
  content: string;
}>;

export default function MarkdownMessage({ content }: MarkdownMessageProps) {
  const deferredContent = useDeferredValue(content);

  return useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
        urlTransform={safeUrlTransform}
      >
        {deferredContent}
      </ReactMarkdown>
    ),
    [deferredContent],
  );
}
