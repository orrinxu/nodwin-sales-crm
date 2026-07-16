import "server-only"
import { z } from "zod"
import { createServerClient } from "@/lib/supabase/server"
import type { AuthenticatedUser } from "@/lib/security/auth"

/**
 * Tasks / follow-ups with due dates (ORR-725). Assignable to any user (defaults
 * to the creator); optionally linked to a deal / account / contact.
 */

export interface TasksCallContext {
  user: AuthenticatedUser
  source: "web" | "mcp" | "webhook" | "system"
}

export type TaskStatus = "open" | "done"
export type TaskPriority = "low" | "normal" | "high"

export interface TaskRecord {
  id: string
  title: string
  description: string | null
  dueDate: string | null
  status: TaskStatus
  priority: TaskPriority
  assigneeUserId: string
  opportunityId: string | null
  opportunityName: string | null
  accountId: string | null
  accountName: string | null
  contactId: string | null
  contactName: string | null
  createdBy: string
  completedAt: string | null
  createdAt: string
}

const linkFields = z.object({
  opportunityId: z.string().uuid().nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
})

export const taskCreateSchema = linkFields.extend({
  title: z.string().min(1, "Title is required").max(300),
  description: z.string().max(2000).nullable().optional().or(z.literal("")),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullable().optional().or(z.literal("")),
  priority: z.enum(["low", "normal", "high"]).optional(),
  assigneeUserId: z.string().uuid().optional(),
})
export type TaskCreateInput = z.input<typeof taskCreateSchema>

export const taskUpdateSchema = taskCreateSchema.partial()
export type TaskUpdateInput = z.input<typeof taskUpdateSchema>

const SELECT =
  "*, opportunities(name), accounts(name), contacts(full_name)"

function toDomain(data: Record<string, unknown>): TaskRecord {
  const opp = data.opportunities as { name?: string } | null
  const acc = data.accounts as { name?: string } | null
  const con = data.contacts as { full_name?: string } | null
  return {
    id: data.id as string,
    title: data.title as string,
    description: (data.description as string) ?? null,
    dueDate: (data.due_date as string) ?? null,
    status: data.status as TaskStatus,
    priority: data.priority as TaskPriority,
    assigneeUserId: data.assignee_user_id as string,
    opportunityId: (data.opportunity_id as string) ?? null,
    opportunityName: opp?.name ?? null,
    accountId: (data.account_id as string) ?? null,
    accountName: acc?.name ?? null,
    contactId: (data.contact_id as string) ?? null,
    contactName: con?.full_name ?? null,
    createdBy: data.created_by as string,
    completedAt: (data.completed_at as string) ?? null,
    createdAt: data.created_at as string,
  }
}

function toDb(input: TaskCreateInput | TaskUpdateInput): Record<string, unknown> {
  const db: Record<string, unknown> = {}
  if ("title" in input && input.title !== undefined) db.title = input.title
  if ("description" in input && input.description !== undefined) db.description = input.description || null
  if ("dueDate" in input && input.dueDate !== undefined) db.due_date = input.dueDate || null
  if ("priority" in input && input.priority !== undefined) db.priority = input.priority
  if ("assigneeUserId" in input && input.assigneeUserId !== undefined) db.assignee_user_id = input.assigneeUserId
  if ("opportunityId" in input && input.opportunityId !== undefined) db.opportunity_id = input.opportunityId || null
  if ("accountId" in input && input.accountId !== undefined) db.account_id = input.accountId || null
  if ("contactId" in input && input.contactId !== undefined) db.contact_id = input.contactId || null
  return db
}

/** Open tasks assigned to the current user, soonest due first (undated last). */
export async function getMyTasks(ctx: TasksCallContext): Promise<TaskRecord[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT)
    .eq("assignee_user_id", ctx.user.id)
    .eq("status", "open")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
  if (error) {
    throw new Error(`Failed to load tasks: ${error.message}`)
  }
  return (data ?? []).map((r) => toDomain(r as Record<string, unknown>))
}

export async function getTasksForOpportunity(
  ctx: TasksCallContext,
  opportunityId: string,
): Promise<TaskRecord[]> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("tasks")
    .select(SELECT)
    .eq("opportunity_id", opportunityId)
    .order("status", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
  if (error) {
    throw new Error(`Failed to load tasks: ${error.message}`)
  }
  return (data ?? []).map((r) => toDomain(r as Record<string, unknown>))
}

export async function createTask(
  ctx: TasksCallContext,
  input: TaskCreateInput,
): Promise<TaskRecord> {
  const parsed = taskCreateSchema.parse(input)
  const supabase = await createServerClient()
  const dbData = {
    ...toDb(parsed),
    // Default the assignee to the creator; created_by is always the caller.
    assignee_user_id: parsed.assigneeUserId ?? ctx.user.id,
    created_by: ctx.user.id,
    priority: parsed.priority ?? "normal",
  }
  const { data, error } = await supabase
    .from("tasks")
    .insert(dbData as never)
    .select(SELECT)
    .single()
  if (error) {
    throw new Error(`Failed to create task: ${error.message}`)
  }
  return toDomain(data as Record<string, unknown>)
}

export async function updateTask(
  ctx: TasksCallContext,
  id: string,
  input: TaskUpdateInput,
): Promise<TaskRecord> {
  void ctx
  const parsed = taskUpdateSchema.parse(input)
  const dbData = toDb(parsed)
  if (Object.keys(dbData).length === 0) {
    throw new Error("No fields to update")
  }
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("tasks")
    .update(dbData as never)
    .eq("id", id)
    .select(SELECT)
    .single()
  if (error) {
    throw new Error(`Failed to update task: ${error.message}`)
  }
  return toDomain(data as Record<string, unknown>)
}

/** Mark done/open; stamps completed_at accordingly. */
export async function setTaskStatus(
  ctx: TasksCallContext,
  id: string,
  status: TaskStatus,
): Promise<TaskRecord> {
  void ctx
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from("tasks")
    .update({
      status,
      completed_at: status === "done" ? new Date().toISOString() : null,
    } as never)
    .eq("id", id)
    .select(SELECT)
    .single()
  if (error) {
    throw new Error(`Failed to update task: ${error.message}`)
  }
  return toDomain(data as Record<string, unknown>)
}

export async function deleteTask(ctx: TasksCallContext, id: string): Promise<void> {
  void ctx
  const supabase = await createServerClient()
  const { error } = await supabase.from("tasks").delete().eq("id", id)
  if (error) {
    throw new Error(`Failed to delete task: ${error.message}`)
  }
}
