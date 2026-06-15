/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        // Baret light surfaces
        bg: {
          DEFAULT: "#FAF8F4",   // bone — window canvas
          elevated: "#FFFFFF",  // paper — raised panels
          card: "#FFFFFF",
        },
        // Safety-orange brand accent
        accent: {
          DEFAULT: "#FF6B00",
          soft: "#EA5E00",
          dim: "rgba(255,107,0,0.10)",
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
          900: "#141414",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,20,20,0.05), 0 4px 16px -4px rgba(20,20,20,0.06)",
        lift: "0 2px 4px rgba(20,20,20,0.06), 0 16px 40px -12px rgba(20,20,20,0.14)",
      },
    },
  },
  plugins: [],
};
