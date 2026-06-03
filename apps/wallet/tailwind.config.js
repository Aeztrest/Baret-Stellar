/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        bg: {
          DEFAULT: "#08080c",
          elevated: "#0f0f15",
          card: "#13131a",
        },
        accent: {
          DEFAULT: "#6366f1",
          soft: "#a5b4fc",
          dim: "rgba(99,102,241,0.15)",
        },
      },
    },
  },
  plugins: [],
};
