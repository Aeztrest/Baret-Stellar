/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    "../../packages/showcase-ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        // Baret tokens (packages/ui/src/tokens.css) — single source of truth.
        bg:            "var(--bg)",
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
        // Safety-orange brand scale — 500/600 pinned to tokens, intermediate
        // stops are showcase-local extensions (no token equivalent yet).
        brand: {
          50:  "#FFF4EC",
          100: "#FFE7D4",
          200: "#FFCDA6",
          300: "#FFAB6E",
          400: "#FF8838",
          500: "var(--accent)",
          600: "var(--accent-soft)",
          700: "#C24E02",
          800: "#993E06",
          900: "#7C350A",
        },
        // Ink (warm black) scale for text + dark surfaces
        ink: {
          50:  "#F7F6F4",
          100: "#EEECE8",
          200: "#DEDAD3",
          300: "#C3BEB5",
          400: "#94908A",
          500: "#6B6862",
          600: "#4A4742",
          700: "#322F2C",
          800: "#211F1D",
          900: "var(--text)",
        },
        paper: "#FFFFFF",
        bone:  "#FAF8F4",
      },
      borderRadius: {
        pill:  "var(--r-pill)",
        input: "var(--r-input)",
        card:  "var(--r-card)",
        modal: "var(--r-modal)",
      },
      boxShadow: {
        card:  "0 1px 2px rgba(20,20,20,0.05), 0 4px 16px -4px rgba(20,20,20,0.06)",
        lift:  "0 2px 4px rgba(20,20,20,0.06), 0 16px 40px -12px rgba(20,20,20,0.14)",
        brand: "0 4px 14px -2px rgba(255,107,0,0.35)",
      },
      animation: {
        "spin-slow": "spin 3s linear infinite",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
        "shield-in": "shieldIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "fade-up": "fadeUp 0.4s ease forwards",
      },
      keyframes: {
        shieldIn: {
          "0%": { transform: "scale(0.5)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        fadeUp: {
          "0%": { transform: "translateY(12px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
