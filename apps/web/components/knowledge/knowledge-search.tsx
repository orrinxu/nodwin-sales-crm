"use client"

import { useState } from "react"
import { Sparkles, ExternalLink, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { documentCategoryLabel } from "@/lib/data/documents.types"

interface Source {
  documentId: string
  driveFileId: string
  driveUrl: string
  pageRefs: string[]
  opportunityId: string | null
  category: string | null
  similarity: number
}

interface AnswerResponse {
  answer: string
  grounded: boolean
  sources: Source[]
}

export function KnowledgeSearch() {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AnswerResponse | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q || loading) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? `Search failed (${res.status})`)
      setResult(data as AnswerResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Sparkles className="size-5 text-muted-foreground" />
          Deal Knowledge
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask a question about your proposals, RFPs and decks. Answers are grounded in the
          indexed documents you&apos;re entitled to see, with sources.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. What pricing did we propose to Acme for the esports league?"
          aria-label="Question"
        />
        <Button type="submit" disabled={loading || query.trim().length === 0}>
          <Search className="size-4" />
          {loading ? "Searching…" : "Ask"}
        </Button>
      </form>

      {error && (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Answer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm">{result.answer}</p>
            </CardContent>
          </Card>

          {result.grounded && result.sources.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Sources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.sources.map((s, i) => (
                  <div key={s.documentId} className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-muted-foreground">[{i + 1}]</span>
                      <a
                        href={s.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 truncate text-primary hover:underline"
                      >
                        <span className="truncate">Open document</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                      {s.pageRefs.length > 0 && (
                        <span className="text-xs text-muted-foreground">({s.pageRefs.join(", ")})</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {s.category && (
                        <Badge variant="secondary" className="text-xs">
                          {documentCategoryLabel(s.category)}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {Math.round(s.similarity * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
