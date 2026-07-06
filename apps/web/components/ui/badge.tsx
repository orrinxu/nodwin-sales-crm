import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn, stageTokens } from "@/lib/utils"
import type { DealStage } from "@/lib/opportunity"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
        tag: "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

type BadgeVariants = VariantProps<typeof badgeVariants>

interface BadgeBaseProps
  extends Omit<useRender.ComponentProps<"span">, "variant"> {
  render?: Parameters<typeof useRender>[0]["render"]
  className?: string
}

interface BadgeDefault extends BadgeBaseProps, BadgeVariants {
  stage?: never
}

interface BadgeStage extends BadgeBaseProps {
  variant: "stage"
  stage: DealStage
}

type BadgeProps = BadgeDefault | BadgeStage

function Badge(props: BadgeProps) {
  if (props.variant === "stage") {
    const { stage, className, render, ...rest } = props
    const tokens = stageTokens(stage)
    return useRender({
      defaultTagName: "span",
      props: mergeProps<"span">(
        {
          className: cn(badgeVariants({ variant: undefined }), className),
          style: {
            backgroundColor: tokens.bg,
            color: tokens.fg,
            borderColor: "transparent",
          },
        },
        rest,
      ),
      render,
      state: { slot: "badge", variant: "stage", stage },
    })
  }

  const { className, render, variant = "default", ...rest } = props as BadgeDefault
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      rest,
    ),
    render,
    state: { slot: "badge", variant },
  })
}

export { Badge, badgeVariants }
