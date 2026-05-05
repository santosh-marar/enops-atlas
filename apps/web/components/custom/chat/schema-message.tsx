import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import DBMLHighlighter from "@/lib/utils/dbml-syntax-highlighter";
import { CopyButton } from "../copy-button";

export function SchemaMessages({ content }: { content: string }) {
  return (
    <Markdown
      components={{
        code(props) {
          const { children, className, node, ref, ...rest } = props;
          const match = /language-(\w+)/.exec(className || "");
          const lang = match?.[1];
          const code = String(children).replace(/\n$/, "");

          if (lang === "dbml") {
            return (
              <div className="group relative">
                <CopyButton
                  className="absolute top-2 right-2 opacity-0 transition group-hover:opacity-100"
                  value={code}
                />
                <DBMLHighlighter code={code} />
              </div>
            );
          }
          return match ? (
            <div className="group relative">
              {/* Copy Button */}
              <CopyButton
                className="absolute top-2 right-2 opacity-0 transition group-hover:opacity-100"
                iconClassName="size-8"
                value={code}
              />

              <SyntaxHighlighter
                customStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
                language={lang}
                PreTag="div"
                style={vscDarkPlus}
              >
                {code}
              </SyntaxHighlighter>
            </div>
          ) : (
            <code
              {...rest}
              className="rounded bg-card px-1.5 py-0.5 font-mono text-xs"
            >
              {children}
            </code>
          );
        },
        p({ children }) {
          return <p className="mb-3 text-sm leading-relaxed">{children}</p>;
        },
        h1({ children }) {
          return <h1 className="mt-4 mb-2 font-bold text-lg">{children}</h1>;
        },
        h2({ children }) {
          return (
            <h2 className="mt-3 mb-2 font-semibold text-base">{children}</h2>
          );
        },
        h3({ children }) {
          return (
            <h3 className="mt-2 mb-1 font-semibold text-sm">{children}</h3>
          );
        },
        ul({ children }) {
          return (
            <ul className="mb-3 list-inside list-disc space-y-1 text-sm">
              {children}
            </ul>
          );
        },
        ol({ children }) {
          return (
            <ol className="mb-3 list-inside list-decimal space-y-1 text-sm">
              {children}
            </ol>
          );
        },
        li({ children }) {
          return <li className="text-sm leading-relaxed">{children}</li>;
        },
        strong({ children }) {
          return <strong className="font-semibold">{children}</strong>;
        },
        blockquote({ children }) {
          return (
            <blockquote className="my-2 border-l-2 pl-3 italic">
              {children}
            </blockquote>
          );
        },
      }}
    >
      {content}
    </Markdown>
  );
}
