"use client"

import { useCallback, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export function useSessionManager() {
  const router = useRouter()
  const routerRef = useRef(router)

  useEffect(() => {
    routerRef.current = router
  }, [router])

  useEffect(() => {
    const supabase = createClient()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        routerRef.current.push("/login")
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])
}

export function useSignOut() {
  const signOut = useCallback(async () => {
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  return { signOut }
}
