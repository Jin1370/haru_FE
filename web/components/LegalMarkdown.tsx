import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function LegalMarkdown({ source }: { source: string }) {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 text-[color:var(--color-text)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-6 text-3xl font-semibold text-[color:var(--color-text)] md:text-4xl">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-12 mb-4 text-2xl font-semibold text-[color:var(--color-text)]">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-8 mb-3 text-xl font-semibold text-[color:var(--color-text)]">
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p className="my-4 leading-7 text-[color:var(--color-text)]">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="my-4 list-disc space-y-1 pl-6 text-[color:var(--color-text)]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-4 list-decimal space-y-1 pl-6 text-[color:var(--color-text)]">
              {children}
            </ol>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-6 border-l-2 border-[color:var(--color-primary)] pl-4 text-[color:var(--color-text-secondary)] italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-6 overflow-x-auto">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[color:var(--color-surface)] text-[color:var(--color-text)]">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="border border-[color:var(--color-border)] px-3 py-2 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[color:var(--color-border)] px-3 py-2 align-top text-[color:var(--color-text)]">
              {children}
            </td>
          ),
          code: ({ children }) => (
            <code className="rounded bg-[color:var(--color-surface)] px-1.5 py-0.5 text-sm text-[color:var(--color-text)]">
              {children}
            </code>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[color:var(--color-primary-dark)] underline hover:text-[color:var(--color-primary)]"
            >
              {children}
            </a>
          ),
          hr: () => (
            <hr className="my-10 border-[color:var(--color-border)]" />
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-[color:var(--color-text)]">
              {children}
            </strong>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </article>
  );
}
