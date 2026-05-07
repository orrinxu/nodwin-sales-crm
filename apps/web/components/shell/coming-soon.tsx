import { Construction } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

interface ComingSoonProps {
  title: string
}

export function ComingSoon({ title }: ComingSoonProps) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Card size="sm" className="w-80">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <Construction className="size-8 text-muted-foreground" />
          <div>
            <h2 className="text-base font-medium">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This section is coming soon.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
