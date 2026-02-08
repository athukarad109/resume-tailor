"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { useImperativeHandle, useRef, useEffect, forwardRef, useMemo } from "react";

export interface ResumeEditorHandle {
  getHtml: () => string;
}

interface ResumeEditorProps {
  initialHtml: string;
  placeholder?: string;
  minHeight?: string;
}

const Toolbar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "2px",
        padding: "6px 8px",
        border: "1px solid #e2e8f0",
        borderBottom: "none",
        borderRadius: "8px 8px 0 0",
        background: "#f8fafc",
      }}
    >
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={editor.isActive("bold") ? "is-active" : ""}
        style={{
          padding: "4px 8px",
          fontWeight: editor.isActive("bold") ? 700 : 400,
        }}
        title="Bold"
      >
        B
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        style={{ fontStyle: editor.isActive("italic") ? "normal" : "italic", padding: "4px 8px" }}
        title="Italic"
      >
        I
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        style={{
          textDecoration: editor.isActive("underline") ? "none" : "underline",
          padding: "4px 8px",
        }}
        title="Underline"
      >
        U
      </button>
      <span style={{ width: 1, background: "#e2e8f0", margin: "0 4px" }} />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        style={{ padding: "4px 8px" }}
        title="Bullet list"
      >
        • List
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        style={{ padding: "4px 8px" }}
        title="Numbered list"
      >
        1. List
      </button>
      <span style={{ width: 1, background: "#e2e8f0", margin: "0 4px" }} />
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        style={{ padding: "4px 8px", fontSize: "0.85rem" }}
        title="Section heading"
      >
        H2
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().setParagraph().run()}
        style={{ padding: "4px 8px", fontSize: "0.85rem" }}
        title="Paragraph"
      >
        P
      </button>
    </div>
  );
};

const ResumeEditor = forwardRef<ResumeEditorHandle, ResumeEditorProps>(function ResumeEditor(
  { initialHtml, placeholder = "Resume content…", minHeight = "40vh" },
  ref
) {
  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: initialHtml || "<p></p>",
    editorProps: {
      attributes: {
        style: "min-height: " + minHeight + "; padding: 1rem; outline: none;",
      },
    },
  });

  const initialHtmlRef = useRef(initialHtml);
  useEffect(() => {
    if (initialHtml && initialHtml !== initialHtmlRef.current) {
      initialHtmlRef.current = initialHtml;
      editor?.commands.setContent(initialHtml, false);
    }
  }, [initialHtml, editor]);

  useImperativeHandle(ref, () => ({
    getHtml: () => editor?.getHTML() ?? "",
  }));

  const editorWrapperStyle = useMemo(
    () => ({
      border: "1px solid #e2e8f0",
      borderRadius: "0 0 8px 8px",
      background: "#ffffff",
      color: "#171717",
      fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
      fontSize: "0.9375rem",
      lineHeight: 1.5,
    }),
    []
  );

  return (
    <div>
      <Toolbar editor={editor} />
      <div style={editorWrapperStyle}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

export default ResumeEditor;
