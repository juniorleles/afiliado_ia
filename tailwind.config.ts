import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-text)",
        card: "var(--color-surface)",
        primary: { DEFAULT: "var(--color-primary)", foreground: "var(--color-on-primary)", text: "var(--color-primary-text)" },
        secondary: { DEFAULT: "var(--color-secondary)", foreground: "var(--color-on-secondary)" },
        success: {
          DEFAULT: "var(--color-success)",
          subtle: "var(--color-success-bg)",
          solid: "var(--color-success-solid)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          subtle: "var(--color-warning-bg)",
          solid: "var(--color-warning-solid)",
        },
        review: { DEFAULT: "var(--color-review)", subtle: "var(--color-review-bg)" },
        danger: { DEFAULT: "var(--color-danger)", subtle: "var(--color-danger-bg)", solid: "var(--color-danger-solid)" },
        info: { DEFAULT: "var(--color-info)", subtle: "var(--color-info-bg)" },
        muted: { DEFAULT: "var(--color-background)", foreground: "var(--color-muted)" },
        accent: { DEFAULT: "var(--color-secondary)", foreground: "var(--color-on-secondary)" },
        destructive: { DEFAULT: "var(--color-danger)", foreground: "var(--color-on-primary)" },
        border: "var(--color-border)",
        input: "var(--color-border-strong)",
        ring: "var(--color-info)",
      },
      spacing: {
        "ds-4": "var(--space-4)",
        "ds-8": "var(--space-8)",
        "ds-12": "var(--space-12)",
        "ds-16": "var(--space-16)",
        "ds-20": "var(--space-20)",
        "ds-24": "var(--space-24)",
        "ds-32": "var(--space-32)",
        "ds-40": "var(--space-40)",
        "ds-48": "var(--space-48)",
        "ds-64": "var(--space-64)",
        "ds-80": "var(--space-80)",
        "ds-96": "var(--space-96)",
      },
      borderRadius: {
        "ds-sm": "var(--radius-sm)",
        "ds-md": "var(--radius-md)",
        "ds-lg": "var(--radius-lg)",
        "ds-xl": "var(--radius-xl)",
        "ds-full": "var(--radius-full)",
      },
      boxShadow: {
        "ds-0": "var(--shadow-0)",
        "ds-1": "var(--shadow-1)",
        "ds-2": "var(--shadow-2)",
        "ds-focus": "var(--focus-ring)",
      },
      fontSize: {
        display: ["var(--type-display-size)", { lineHeight: "var(--type-display-line)", fontWeight: "600" }],
        h1: ["var(--type-h1-size)", { lineHeight: "var(--type-h1-line)", fontWeight: "600" }],
        h2: ["var(--type-h2-size)", { lineHeight: "var(--type-h2-line)", fontWeight: "600" }],
        h3: ["var(--type-h3-size)", { lineHeight: "var(--type-h3-line)", fontWeight: "600" }],
        h4: ["var(--type-h4-size)", { lineHeight: "var(--type-h4-line)", fontWeight: "600" }],
        body: ["var(--type-body-size)", { lineHeight: "var(--type-body-line)", fontWeight: "400" }],
        small: ["var(--type-small-size)", { lineHeight: "var(--type-small-line)", fontWeight: "400" }],
        caption: ["var(--type-caption-size)", { lineHeight: "var(--type-caption-line)", fontWeight: "400" }],
        label: ["var(--type-label-size)", { lineHeight: "var(--type-label-line)", fontWeight: "500" }],
        button: ["var(--type-button-size)", { lineHeight: "var(--type-button-line)", fontWeight: "500" }],
      },
      transitionDuration: {
        "ds-fast": "var(--duration-fast)",
        "ds-normal": "var(--duration-normal)",
      },
      transitionTimingFunction: {
        "ds-standard": "var(--ease-standard)",
      },
      maxWidth: {
        content: "var(--content-width)",
      },
    },
  },
  plugins: [],
};

export default config;
