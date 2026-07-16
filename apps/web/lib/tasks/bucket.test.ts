import { describe, it, expect } from "vitest"
import { bucketTaskDue, localDateIso } from "./bucket"

describe("bucketTaskDue", () => {
  const today = "2026-07-16"
  it("buckets by due date relative to today", () => {
    expect(bucketTaskDue(null, today)).toBe("undated")
    expect(bucketTaskDue("2026-07-15", today)).toBe("overdue")
    expect(bucketTaskDue("2026-07-16", today)).toBe("today")
    expect(bucketTaskDue("2026-07-17", today)).toBe("upcoming")
    expect(bucketTaskDue("2026-12-01", today)).toBe("upcoming")
  })
})

describe("localDateIso", () => {
  it("formats a Date as local YYYY-MM-DD", () => {
    // Month is 0-indexed; day/month are zero-padded.
    expect(localDateIso(new Date(2026, 0, 5))).toBe("2026-01-05")
    expect(localDateIso(new Date(2026, 11, 31))).toBe("2026-12-31")
  })
})
