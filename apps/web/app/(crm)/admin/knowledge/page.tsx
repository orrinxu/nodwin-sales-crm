import { redirect } from "next/navigation"

// ORR-635: AI configuration consolidated onto /admin/ai (providers + selection +
// knowledge/RAG endpoints). This route is kept as a redirect for old links.
export default function AdminKnowledgePage() {
  redirect("/admin/ai")
}
