"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Copy, Check, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { UserProfile } from "@/lib/data/users"

const nameSchema = z.object({
  fullName: z
    .string()
    .max(100, "Name must be 100 characters or fewer")
    .nullable()
    .optional(),
})

const notificationSchema = z.object({
  emailNotifications: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
})

type NameFormData = z.infer<typeof nameSchema>
type NotificationFormData = z.infer<typeof notificationSchema>

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="xs"
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check className="size-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="size-3" />
          Copy
        </>
      )}
    </Button>
  )
}

interface ProfileFormProps {
  profile: UserProfile
  updateNameAction: (formData: FormData) => Promise<void>
  updateNotificationsAction: (formData: FormData) => Promise<void>
}

export function ProfileForm({
  profile,
  updateNameAction,
  updateNotificationsAction,
}: ProfileFormProps) {
  const [namePending, setNamePending] = useState(false)
  const [notifPending, setNotifPending] = useState(false)

  const nameForm = useForm<NameFormData>({
    resolver: zodResolver(nameSchema),
    defaultValues: { fullName: profile.fullName ?? "" },
  })

  const notificationForm = useForm<NotificationFormData>({
    resolver: zodResolver(notificationSchema),
    defaultValues: {
      emailNotifications:
        (profile.customData?.notification_preferences as { emailNotifications?: boolean })
          ?.emailNotifications ?? true,
      weeklyDigest:
        (profile.customData?.notification_preferences as { weeklyDigest?: boolean })
          ?.weeklyDigest ?? false,
    },
  })

  async function onNameSubmit(data: NameFormData) {
    setNamePending(true)
    try {
      const fd = new FormData()
      fd.set("fullName", data.fullName ?? "")
      await updateNameAction(fd)
    } finally {
      setNamePending(false)
    }
  }

  async function onNotificationSubmit(data: NotificationFormData) {
    setNotifPending(true)
    try {
      const fd = new FormData()
      if (data.emailNotifications) fd.set("emailNotifications", "on")
      if (data.weeklyDigest) fd.set("weeklyDigest", "on")
      await updateNotificationsAction(fd)
    } finally {
      setNotifPending(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your account settings and preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            Your account details are synced from your authentication provider.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input value={profile.email} disabled readOnly />
          </div>
          <div className="grid gap-1.5">
            <Label>Role</Label>
            <Input
              value={profile.primaryRole.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              disabled
              readOnly
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Primary Entity</Label>
            <Input
              value={profile.primaryEntityName ?? "Not assigned"}
              disabled
              readOnly
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Manager</Label>
            <Input
              value={profile.managerName ?? "None"}
              disabled
              readOnly
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display Name</CardTitle>
          <CardDescription>
            This is how your name will appear across the CRM.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={nameForm.handleSubmit(onNameSubmit)}
            className="flex items-end gap-3"
          >
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                {...nameForm.register("fullName")}
                placeholder="Your display name"
              />
              {nameForm.formState.errors.fullName && (
                <p className="text-xs text-destructive">
                  {nameForm.formState.errors.fullName.message}
                </p>
              )}
            </div>
            <Button type="submit" size="sm" disabled={namePending}>
              <Save className="size-4" />
              {namePending ? "Saving..." : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Choose what notifications you receive.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={notificationForm.handleSubmit(onNotificationSubmit)}
            className="space-y-4"
          >
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                {...notificationForm.register("emailNotifications")}
                className="size-4 rounded border-border accent-primary"
              />
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">Email notifications</span>
                <span className="text-xs text-muted-foreground">
                  Receive email notifications for mentions and updates
                </span>
              </div>
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                {...notificationForm.register("weeklyDigest")}
                className="size-4 rounded border-border accent-primary"
              />
              <div className="grid gap-0.5">
                <span className="text-sm font-medium">Weekly digest</span>
                <span className="text-xs text-muted-foreground">
                  Receive a weekly summary of activity
                </span>
              </div>
            </label>
            <Button type="submit" size="sm" disabled={notifPending}>
              <Save className="size-4" />
              {notifPending ? "Saving..." : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbound Email</CardTitle>
          <CardDescription>
            Send emails to this address to create CRM records automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {profile.crmInboundEmail ? (
            <>
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-3 py-1.5 text-sm font-mono">
                  {profile.crmInboundEmail}
                </code>
                <CopyButton text={profile.crmInboundEmail} />
              </div>
              <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">
                  How to use your inbound email address
                </p>
                <ol className="ml-4 list-decimal space-y-1">
                  <li>Copy your unique inbound email address above</li>
                  <li>
                    Forward any email to this address from your preferred email
                    client
                  </li>
                  <li>
                    The CRM will automatically create a record from the email
                    content
                  </li>
                </ol>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No inbound email address configured yet. Contact an administrator.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>
            Metadata about your account
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label>User ID</Label>
            <Input value={profile.id} disabled readOnly />
          </div>
          <div className="grid gap-1.5">
            <Label>Member Since</Label>
            <Input
              value={new Date(profile.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              disabled
              readOnly
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
