"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import LinkExtension from "@tiptap/extension-link"
import { Bold, Italic, List, ListOrdered, Link, Link2Off } from "lucide-react"

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: string
  disabled?: boolean
  id?: string
  className?: string
  ariaLabel?: string
}

function MenuButton({
  onClick,
  active,
  children,
  label,
}: {
  onClick: () => void
  active: boolean
  children: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`rounded p-1.5 transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      }`}
    >
      {children}
    </button>
  )
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = "",
  minHeight = "100px",
  disabled = false,
  id,
  className = "",
  ariaLabel,
}: RichTextEditorProps) {
  const [linkUrl, setLinkUrl] = useState("")
  const [showLinkInput, setShowLinkInput] = useState(false)
  const linkInputRef = useRef<HTMLInputElement>(null)

  const editor = useEditor({
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
    },
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Placeholder.configure({ placeholder }),
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline underline-offset-2 hover:text-primary/80",
        },
      }),
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      if (html === "<p></p>") {
        onChange("")
      } else {
        onChange(html)
      }
    },
  })

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [editor, value])

  useEffect(() => {
    if (editor) {
      editor.setEditable(!disabled)
    }
  }, [editor, disabled])

  useEffect(() => {
    if (showLinkInput && linkInputRef.current) {
      linkInputRef.current.focus()
    }
  }, [showLinkInput])

  const handleSetLink = useCallback(() => {
    if (!editor || !linkUrl) return
    const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run()
    setShowLinkInput(false)
    setLinkUrl("")
  }, [editor, linkUrl])

  const handleUnsetLink = useCallback(() => {
    editor?.chain().focus().unsetLink().run()
    setShowLinkInput(false)
    setLinkUrl("")
  }, [editor])

  const handleOpenLinkInput = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes("link").href
    setLinkUrl(previousUrl || "")
    setShowLinkInput(true)
  }, [editor])

  if (!editor) return null

  return (
    <div
      id={id}
      className={`relative rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 ${className}`}
    >
      {editor && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-md"
        >
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            label="Bold"
          >
            <Bold className="size-3.5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            label="Italic"
          >
            <Italic className="size-3.5" />
          </MenuButton>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <MenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            label="Bullet list"
          >
            <List className="size-3.5" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            label="Ordered list"
          >
            <ListOrdered className="size-3.5" />
          </MenuButton>
          <span className="mx-0.5 h-4 w-px bg-border" />
          {editor.isActive("link") ? (
            <MenuButton
              onClick={handleUnsetLink}
              active={true}
              label="Remove link"
            >
              <Link2Off className="size-3.5" />
            </MenuButton>
          ) : (
            <MenuButton
              onClick={handleOpenLinkInput}
              active={false}
              label="Add link"
            >
              <Link className="size-3.5" />
            </MenuButton>
          )}
        </BubbleMenu>
      )}

      {showLinkInput && (
        <div className="absolute left-0 right-0 top-0 z-10 flex items-center gap-1 rounded-t-lg border-b bg-popover p-2 shadow-sm">
          <input
            ref={linkInputRef}
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSetLink()
              if (e.key === "Escape") {
                setShowLinkInput(false)
                setLinkUrl("")
              }
            }}
            placeholder="https://example.com"
            className="flex-1 rounded border border-input bg-transparent px-2 py-1 text-xs outline-none focus:border-ring"
          />
          <button
            type="button"
            onClick={handleSetLink}
            className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLinkInput(false)
              setLinkUrl("")
            }}
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      <EditorContent
        editor={editor}
        className={`prose prose-sm max-w-none px-3 py-2 ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
        style={{ minHeight }}
      />

      <style>{`
        .tiptap {
          outline: none;
          min-height: ${minHeight};
        }
        .tiptap p {
          margin: 0;
        }
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
          color: var(--muted-foreground);
          opacity: 0.6;
        }
        .tiptap ul,
        .tiptap ol {
          padding-left: 1.5rem;
          margin: 0.25rem 0;
        }
        .tiptap ul {
          list-style-type: disc;
        }
        .tiptap ol {
          list-style-type: decimal;
        }
        .tiptap li {
          margin: 0;
        }
        .tiptap a {
          color: var(--primary);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
      `}</style>
    </div>
  )
}
