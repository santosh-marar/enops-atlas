import DBMLHighlighter from "@/lib/utils/dbml-syntax-highlighter";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

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
            return <DBMLHighlighter code={code} />;
          }

          return match ? (
            <SyntaxHighlighter
              PreTag="div"
              language={lang}
              style={vscDarkPlus}
              customStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem" }}
            >
              {code}
            </SyntaxHighlighter>
          ) : (
            <code
              {...rest}
              className="bg-card px-1.5 py-0.5 rounded text-xs font-mono"
            >
              {children}
            </code>
          );
        },
        p({ children }) {
          return <p className="mb-3 leading-relaxed text-sm">{children}</p>;
        },
        h1({ children }) {
          return <h1 className="text-lg font-bold mb-2 mt-4">{children}</h1>;
        },
        h2({ children }) {
          return (
            <h2 className="text-base font-semibold mb-2 mt-3">{children}</h2>
          );
        },
        h3({ children }) {
          return (
            <h3 className="text-sm font-semibold mb-1 mt-2">{children}</h3>
          );
        },
        ul({ children }) {
          return (
            <ul className="list-disc list-inside mb-3 space-y-1 text-sm">
              {children}
            </ul>
          );
        },
        ol({ children }) {
          return (
            <ol className="list-decimal list-inside mb-3 space-y-1 text-sm">
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
            <blockquote className="border-l-2 pl-3 italic my-2">
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