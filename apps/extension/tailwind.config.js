/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{ts,tsx,html}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/showcase-ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        bg:           "var(--bg)",
        "bg-elevated": "var(--bg-elevated)",
        "bg-card":     "var(--bg-card)",
        "bg-modal":    "var(--bg-modal)",
        text:          "var(--text)",
        "text-muted":  "var(--text-muted)",
        "text-faint":  "var(--text-faint)",
        accent:        "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        ok:            "var(--ok)",
        warn:          "var(--warn)",
        bad:           "var(--bad)",
        live:          "var(--live)",
      },
      borderRadius: {
        pill:   "var(--r-pill)",
        input:  "var(--r-input)",
        card:   "var(--r-card)",
        modal:  "var(--r-modal)",
        window: "var(--r-window)",
      },
      transitionTimingFunction: {
        bx: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};
