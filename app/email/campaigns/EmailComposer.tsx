"use client";

import { useCallback, useRef, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BoldIcon,
  ItalicIcon,
  ListIcon,
  LinkIcon,
  UserIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  subject: string;
  onSubjectChange: (v: string) => void;
  bodyHtml: string;
  onBodyChange: (v: string) => void;
  signature?: string | null;
  onInsertVariable?: () => void;
  attachments?: File[];
  onAttachmentsChange?: (files: File[]) => void;
};

export default function EmailComposer({
  subject,
  onSubjectChange,
  bodyHtml,
  onBodyChange,
  signature = "",
  onInsertVariable,
  attachments = [],
  onAttachmentsChange,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { dir: "rtl" } }),
    ],
    content: bodyHtml || "<p></p>",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[200px] px-4 py-3 focus:outline-none",
        dir: "rtl",
        style: "text-align: right;",
      },
    },
    onUpdate: ({ editor }) => {
      onBodyChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && bodyHtml !== editor.getHTML()) {
      editor.commands.setContent(bodyHtml || "<p></p>");
    }
  }, [bodyHtml, editor]);

  const handleAddVariable = useCallback(() => {
    if (editor) {
      editor.chain().focus().insertContent("{{name}}").run();
      onBodyChange(editor.getHTML());
    }
    onInsertVariable?.();
  }, [editor, onBodyChange, onInsertVariable]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    onAttachmentsChange?.([...attachments, ...files]);
    e.target.value = "";
  };

  const removeAttachment = (index: number) => {
    onAttachmentsChange?.(attachments.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">נושא</label>
        <Input
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="נושא האימייל (אפשר {{name}})"
          className="rounded-xl"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-700">תוכן</label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddVariable}
            className="rounded-lg h-8"
          >
            <UserIcon className="size-4 ml-1" />
            {"הוסף {{name}}"}
          </Button>
        </div>
        <div
          className={cn(
            "rounded-xl border border-slate-300 overflow-hidden bg-white",
            "[&_.ProseMirror]:min-h-[200px] [&_.ProseMirror]:px-4 [&_.ProseMirror]:py-3 [&_.ProseMirror]:text-right"
          )}
        >
          {editor && (
            <div className="flex gap-1 border-b border-slate-200 p-2">
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={cn(
                  "rounded p-1.5",
                  editor.isActive("bold") ? "bg-slate-200" : "hover:bg-slate-100"
                )}
              >
                <BoldIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={cn(
                  "rounded p-1.5",
                  editor.isActive("italic") ? "bg-slate-200" : "hover:bg-slate-100"
                )}
              >
                <ItalicIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={cn(
                  "rounded p-1.5",
                  editor.isActive("bulletList") ? "bg-slate-200" : "hover:bg-slate-100"
                )}
              >
                <ListIcon className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const url = window.prompt("קישור:");
                  if (url) editor.chain().focus().setLink({ href: url }).run();
                }}
                className={cn(
                  "rounded p-1.5",
                  editor.isActive("link") ? "bg-slate-200" : "hover:bg-slate-100"
                )}
              >
                <LinkIcon className="size-4" />
              </button>
            </div>
          )}
          <EditorContent editor={editor} />
        </div>
        {signature && (
          <p className="mt-2 text-xs text-muted-foreground">
            חתימה גלובלית תתווסף אוטומטית
          </p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">קבצים מצורפים</label>
        <div
          className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center hover:border-slate-300 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <p className="text-sm text-muted-foreground">גרור קבצים לכאן או לחץ לבחירה</p>
        </div>
        {attachments.length > 0 && (
          <ul className="mt-2 space-y-1">
            {attachments.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{f.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAttachment(i)}
                  className="text-red-600 h-7"
                >
                  הסר
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
