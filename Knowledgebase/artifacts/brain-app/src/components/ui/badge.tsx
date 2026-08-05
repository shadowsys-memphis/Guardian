import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-sm border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring font-display tracking-wider uppercase",
        {
          "border-transparent bg-primary text-primary-foreground shadow": variant === "default",
          "border-transparent bg-secondary text-secondary-foreground": variant === "secondary",
          "border-transparent bg-destructive text-destructive-foreground shadow": variant === "destructive",
          "border-transparent bg-success text-success-foreground shadow": variant === "success",
          "text-foreground border-border": variant === "outline",
        },
        className
      )}
      {...props}
    />
  )
}

export { Badge }
