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
import { useEffect, useRef } from "react";
import { SAMPLE_DBML } from "@/data/sample-dbml";
import { db } from "@/lib/db";
import { useSchemaStore } from "@/store/use-schema-store";
import { validateDBML } from "@/validation/dbml-editor";

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
  languageData: { commentTokens: { line: "//" } },
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
});

// Themes
const zincDarkTheme = EditorView.theme(
  {
    ".cm-activeLine": { backgroundColor: "#3f3f4640" },
    ".cm-activeLineGutter": { backgroundColor: "#3f3f4640" },
    ".cm-activeLineGutter.cm-lineNumbers": { color: "#a1a1aa" },
    ".cm-bracketMatching": {
      backgroundColor: "#3f3f46",
      outline: "1px solid #71717a",
    },
    ".cm-content": {
      caretColor: "#e4e4e7",
      lineHeight: "20px",
      padding: "16px 0",
    },
    ".cm-cursor": { borderLeftColor: "#e4e4e7" },
    ".cm-gutters": {
      backgroundColor: "#27272a",
      borderRight: "1px solid #3f3f46",
      color: "#52525b",
    },
    ".cm-lineNumbers .cm-gutterElement": { paddingRight: "12px" },
    ".cm-lintRange-error": {
      backgroundImage: "none",
      borderBottom: "2px solid #ef4444",
    },
    ".cm-lintRange-warning": {
      backgroundImage: "none",
      borderBottom: "2px dashed #f59e0b",
    },
    ".cm-selectionBackground, ::selection": { backgroundColor: "#52525b" },
    ".cm-tooltip": {
      backgroundColor: "#3f3f46",
      border: "1px solid #52525b",
      color: "#e4e4e7",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      backgroundColor: "#52525b",
    },
    "&": {
      backgroundColor: "#27272a",
      color: "#e4e4e7",
      fontSize: "14px",
      height: "100%",
    },
  },
  { dark: true }
);

const zincDarkHighlight = HighlightStyle.define([
  { color: "#71717a", fontStyle: "italic", tag: tags.lineComment },
  { color: "#71717a", fontStyle: "italic", tag: tags.blockComment },
  { color: "#c084fc", tag: tags.keyword },
  { color: "#67e8f9", tag: tags.typeName },
  { color: "#e4e4e7", tag: tags.variableName },
  { color: "#86efac", tag: tags.string },
  { color: "#fb923c", tag: tags.number },
  { color: "#94a3b8", tag: tags.operator },
  { color: "#e4e4e7", tag: tags.bracket },
]);

const lightTheme = EditorView.theme({
  ".cm-content": { lineHeight: "20px", padding: "16px 0" },
  "&": { fontSize: "14px", height: "100%" },
});

const lightHighlight = HighlightStyle.define([
  { color: "#008000", fontStyle: "italic", tag: tags.lineComment },
  { color: "#008000", fontStyle: "italic", tag: tags.blockComment },
  { color: "#0000ff", tag: tags.keyword },
  { color: "#267f99", tag: tags.typeName },
  { color: "#a31515", tag: tags.string },
  { color: "#098658", tag: tags.number },
  { color: "#000000", tag: tags.operator },
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
            apply: "Table table_name {\n  id integer [pk, increment]\n  \n}",
            detail: "Create a new table",
            label: "Table",
            type: "keyword",
          },
          {
            apply: "Ref: table1.field1 > table2.field2",
            detail: "Foreign key reference",
            label: "Ref",
            type: "keyword",
          },
          {
            apply: "Enum enum_name {\n  value1\n  value2\n}",
            detail: "Define an enum type",
            label: "Enum",
            type: "keyword",
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

// Linter — wraps existing validateDBML
function dbmlLinter() {
  return linter(async (view) => {
    const code = view.state.doc.toString();
    let result: Awaited<ReturnType<typeof validateDBML>>;
    try {
      result = await validateDBML(code);
    } catch {
      return [];
    }
    const diagnostics: Diagnostic[] = result.errors.map((err) => {
      const line = view.state.doc.line(Math.max(1, err.line));
      const from = line.from + Math.max(0, err.column - 1);
      const to = Math.min(line.to, from + 30);
      return {
        from,
        message: err.message,
        severity: err.severity === "error" ? "error" : "warning",
        to,
      };
    });
    return diagnostics;
  });
}

// Component
export default function DBMLEditor() {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isUpdatingStoreRef = useRef(false);

  const { updateFromDBML, dbml } = useSchemaStore();

  // Seed store on first mount
  useEffect(() => {
    const init = async () => {
      const projectId = localStorage.getItem("current_project_id");

      if (projectId) {
        const project = await db.projects.get(projectId);
        if (project?.dbml) {
          updateFromDBML(project.dbml);
          return;
        }
      }

      // No project or no dbml in db — fall back to sample
      if (!dbml || dbml.trim() === "") {
        updateFromDBML(SAMPLE_DBML);
      }
    };

    init();
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
        dbmlLinter(),
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

    const view = new EditorView({ parent: containerRef.current, state });
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
          insert: dbml ?? "",
          to: viewRef.current.state.doc.length,
        },
      });
      setTimeout(() => {
        isUpdatingStoreRef.current = false;
      }, 200);
    }
  }, [dbml]);

  return <div className="h-full flex-1 font-mono" ref={containerRef} />;
}
