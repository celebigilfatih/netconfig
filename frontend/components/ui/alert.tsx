import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const alertVariants = cva("rounded-md border p-3 text-sm", {
  variants: {
    variant: {
      success: "border-green-200 bg-green-50 text-green-700",
      error: "border-red-200 bg-red-50 text-red-700",
      info: "border-blue-200 bg-blue-50 text-blue-700",
      warning: "border-yellow-200 bg-yellow-50 text-yellow-800",
    },
  },
  defaultVariants: { variant: "info" },
});

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(({ className, variant, ...props }, ref) => (
  <div ref={ref} className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = "Alert";

