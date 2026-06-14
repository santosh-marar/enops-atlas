"use client";

import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { type Diagnostic, linter, lintGutter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { SAMPLE_DBML } from "@/data/sample-dbml";
import { useSchemaStore } from "@/store/use-schema-store";
import { type ValidationError, validateDBML } from "@/validation/dbml-editor";

// DBML StreamLanguage
const KEYWORDS = new Set([
  "Table",
  "Ref",
  "Enum",
  "TableGroup",
  "Project",
  "Note",
  "pk",
  "null",
  "not",
  "unique",
  "increment",
  "default",
  "note",
  "ref",
  "delete",
  "update",
  "indexes",
  "CASCADE",
  "SET",
  "RESTRICT",
  "NO",
  "ACTION",
  "primary",
  "key",
]);
const TYPE_KEYWORDS = new Set([
  "integer",
  "int",
  "bigint",
  "smallint",
  "tinyint",
  "varchar",
  "char",
  "text",
  "string",
  "decimal",
  "numeric",
  "float",
  "double",
  "real",
  "money",
  "boolean",
  "bool",
  "bit",
  "date",
  "datetime",
  "timestamp",
  "time",
  "enum",
  "json",
  "jsonb",
  "uuid",
  "blob",
  "binary",
]);

const dbmlLanguage = StreamLanguage.define({
  name: "dbml",
  token(stream) {
    if (stream.match("//")) {
      stream.skipToEnd();
      return "lineComment";
    }
    if (stream.match("/*")) {
      while (!stream.eol()) {
        if (stream.match("*/")) break;
        stream.next();
      }
      return "blockComment";
    }
    if (stream.match(/"([^"\\]|\\.)*"/)) return "string";
    if (stream.match(/'([^'\\]|\\.)*'/)) return "string";
    if (stream.match(/`([^`\\]|\\.)*`/)) return "string";
    if (stream.match(/\d+(\.\d+)?/)) return "number";
    if (stream.match(/[{}()[\]]/)) return "bracket";
    if (stream.match(/[<>-]/)) return "operator";
    if (stream.match(/[a-zA-Z_]\w*/)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return "keyword";
      if (TYPE_KEYWORDS.has(word)) return "typeName";
      return "variableName";
    }
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "//" } },
});

// Themes
const zincDarkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#27272a",
      color: "#e4e4e7",
      height: "100%",
      fontSize: "14px",
    },
    ".cm-content": {
      padding: "16px 0",
      caretColor: "#e4e4e7",
      lineHeight: "20px",
    },
    ".cm-cursor": { borderLeftColor: "#e4e4e7" },
    ".cm-selectionBackground, ::selection": { backgroundColor: "#52525b" },
    ".cm-activeLine": { backgroundColor: "#3f3f4640" },
    ".cm-activeLineGutter": { backgroundColor: "#3f3f4640" },
    ".cm-gutters": {
      backgroundColor: "#27272a",
      color: "#52525b",
      borderRight: "1px solid #3f3f46",
    },
    ".cm-lineNumbers .cm-gutterElement": { paddingRight: "12px" },
    ".cm-activeLineGutter.cm-lineNumbers": { color: "#a1a1aa" },
    ".cm-bracketMatching": {
      backgroundColor: "#3f3f46",
      outline: "1px solid #71717a",
    },
    ".cm-tooltip": {
      backgroundColor: "#3f3f46",
      border: "1px solid #52525b",
      color: "#e4e4e7",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "#52525b",
    },
    ".cm-lintRange-error": {
      backgroundImage: "none",
      borderBottom: "2px solid #ef4444",
    },
    ".cm-lintRange-warning": {
      backgroundImage: "none",
      borderBottom: "2px dashed #f59e0b",
    },
  },
  { dark: true }
);

const zincDarkHighlight = HighlightStyle.define([
  { tag: tags.lineComment, color: "#71717a", fontStyle: "italic" },
  { tag: tags.blockComment, color: "#71717a", fontStyle: "italic" },
  { tag: tags.keyword, color: "#c084fc" },
  { tag: tags.typeName, color: "#67e8f9" },
  { tag: tags.variableName, color: "#e4e4e7" },
  { tag: tags.string, color: "#86efac" },
  { tag: tags.number, color: "#fb923c" },
  { tag: tags.operator, color: "#94a3b8" },
  { tag: tags.bracket, color: "#e4e4e7" },
]);

const lightTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px" },
  ".cm-content": { padding: "16px 0", lineHeight: "20px" },
});

const lightHighlight = HighlightStyle.define([
  { tag: tags.lineComment, color: "#008000", fontStyle: "italic" },
  { tag: tags.blockComment, color: "#008000", fontStyle: "italic" },
  { tag: tags.keyword, color: "#0000ff" },
  { tag: tags.typeName, color: "#267f99" },
  { tag: tags.string, color: "#a31515" },
  { tag: tags.number, color: "#098658" },
  { tag: tags.operator, color: "#000000" },
]);

// Completions
const dbmlCompletions = autocompletion({
  override: [
    (ctx) => {
      const word = ctx.matchBefore(/\w*/);
      if (!word || (word.from === word.to && !ctx.explicit)) return null;
      return {
        from: word.from,
        options: [
          {
            label: "Table",
            type: "keyword",
            detail: "Create a new table",
            apply: "Table table_name {\n  id integer [pk, increment]\n  \n}",
          },
          {
            label: "Ref",
            type: "keyword",
            detail: "Foreign key reference",
            apply: "Ref: table1.field1 > table2.field2",
          },
          {
            label: "Enum",
            type: "keyword",
            detail: "Define an enum type",
            apply: "Enum enum_name {\n  value1\n  value2\n}",
          },
          ...Array.from(TYPE_KEYWORDS).map((kw) => ({
            label: kw,
            type: "type" as const,
          })),
          ...Array.from(KEYWORDS).map((kw) => ({
            label: kw,
            type: "keyword" as const,
          })),
        ],
      };
    },
  ],
});

// Linter — wraps your existing validateDBML, keeps the error panel in sync
function makeLinter(onErrors: (errs: ValidationError[]) => void) {
  return linter(
    async (view) => {
      const code = view.state.doc.toString();
      let result: Awaited<ReturnType<typeof validateDBML>>;
      try {
        result = await validateDBML(code);
      } catch {
        return [];
      }
      onErrors(result.errors);
      const diagnostics: Diagnostic[] = result.errors.map((err) => {
        const lineObj = view.state.doc.line(
          Math.max(1, Math.min(err.line, view.state.doc.lines))
        );
        const from = lineObj.from + Math.max(0, err.column - 1);
        const to = Math.min(lineObj.to, from + 30);
        return {
          from,
          to,
          severity: err.severity === "error" ? "error" : "warning",
          message: err.message,
        };
      });
      return diagnostics;
    },
    { delay: 1000 }
  ); // 1 s debounce — matches your original timer
}

// Component
export default function DBMLEditor() {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isUpdatingStoreRef = useRef(false);

  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );

  const { updateFromDBML, dbml } = useSchemaStore();

  // Seed store on first mount if empty — same logic as before
  useEffect(() => {
    const hasProject = localStorage.getItem("enops-dev-last-project-id");
    if (!hasProject && (!dbml || dbml.trim() === "")) {
      updateFromDBML(SAMPLE_DBML);
    }
  }, []);

  // Build / rebuild editor when theme changes
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = theme === "dark";
    const initialContent =
      viewRef.current?.state.doc.toString() ?? dbml ?? SAMPLE_DBML;

    viewRef.current?.destroy();

    // Auto-save to store when valid (fires after linter runs)
    const autoSaveListener = EditorView.updateListener.of(async (update) => {
      if (!update.docChanged || isUpdatingStoreRef.current) return;
      const value = update.state.doc.toString();
      try {
        const result = await validateDBML(value);
        if (result.isValid && value) {
          const currentStoreDbml = useSchemaStore.getState().dbml;
          const isUpdating = useSchemaStore.getState().isUpdating;
          if (value !== currentStoreDbml && !isUpdating) {
            isUpdatingStoreRef.current = true;
            try {
              await updateFromDBML(value, true);
            } finally {
              setTimeout(() => {
                isUpdatingStoreRef.current = false;
              }, 200);
            }
          }
        }
      } catch {
        /* silent — invalid DBML mid-type is expected */
      }
    });

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        drawSelection(),
        lintGutter(),
        dbmlLanguage,
        isDark
          ? [zincDarkTheme, syntaxHighlighting(zincDarkHighlight)]
          : [lightTheme, syntaxHighlighting(lightHighlight)],
        dbmlCompletions,
        makeLinter(setValidationErrors),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
        ]),
        EditorView.lineWrapping,
        autoSaveListener,
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    view.focus();

    return () => view.destroy();
  }, [theme]);

  // Sync store → editor (e.g. AI accept/reject, external dbml reset)
  useEffect(() => {
    if (!viewRef.current || isUpdatingStoreRef.current) return;
    const editorValue = viewRef.current.state.doc.toString();
    if (dbml !== editorValue) {
      isUpdatingStoreRef.current = true;
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: dbml ?? "",
        },
      });
      // Clear errors if store was reset to empty
      if (!dbml || dbml === "") setValidationErrors([]);
      setTimeout(() => {
        isUpdatingStoreRef.current = false;
      }, 200);
    }
  }, [dbml]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Error panel — identical markup to what you had before */}
      {validationErrors.length > 0 && (
        <div className="border-b bg-card">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-destructive" />
              <span className="font-medium text-sm">
                {validationErrors.length} issue
                {validationErrors.length > 1 ? "s" : ""}
              </span>
            </div>

            <span className="text-muted-foreground text-xs">
              DBML Validation
            </span>
          </div>

          <div className="max-h-52 overflow-y-auto">
            {validationErrors.map((err, idx) => {
              const isError = err.severity === "error";

              return (
                <button
                  className="group flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  key={idx}
                >
                  <div
                    className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${isError ? "bg-destructive" : "bg-yellow-500"}
                    `}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-medium text-[10px] uppercase tracking-wide ${
                          isError
                            ? "bg-destructive/10 text-destructive"
                            : "bg-yellow-500/10 text-yellow-600"
                        }
                        `}
                      >
                        {err.severity}
                      </span>

                      <span className="font-mono text-muted-foreground text-xs">
                        {err.line}:{err.column}
                      </span>

                      <p className="line-clamp-2 text-sm leading-relaxed">
                        {err.message}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 font-mono" ref={containerRef} />
    </div>
  );
}
