import * as React from "react";

type ButtonVariant = "light" | "dark" | "outline-light" | "outline-dark";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  href?: string;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm",
  md: "px-6 py-3 text-base",
  lg: "px-8 py-4 text-base",
};

const variantClasses: Record<ButtonVariant, string> = {
  light:
    "bg-obsidian text-paper-white hover:bg-charcoal border border-obsidian",
  dark: "bg-paper-white text-obsidian hover:bg-bone border border-paper-white",
  "outline-light":
    "bg-transparent text-obsidian border border-obsidian hover:bg-obsidian hover:text-paper-white",
  "outline-dark":
    "bg-transparent text-paper-white border border-paper-white hover:bg-paper-white hover:text-obsidian",
};

const baseClasses =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[-0.02em] whitespace-nowrap shrink-0 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-obsidian";

export function Button({
  variant = "light",
  size = "md",
  className = "",
  children,
  href,
  ...props
}: ButtonProps) {
  const classes = `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`;

  if (href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
