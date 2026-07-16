import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // CricRumble sky blue + charcoal — pulled from brand logo
        brand: {
          50: "#eef7ff",
          100: "#d9ecff",
          200: "#bcdcff",
          300: "#8ec6ff",
          400: "#59a6ff",
          500: "#2f86f6",
          600: "#1a6be8",
          700: "#1556d0",
          800: "#1746a8",
          900: "#193d84",
        },
        surface: {
          DEFAULT: "#f0f1f3",
          raised: "#f7f8fa",
          card: "#ffffff",
        },
        line: "#d8dbe2",
        ink: {
          DEFAULT: "#0b0d12",
          soft: "#2a2f3a",
          mute: "#5c6474",
          faint: "#8b93a3",
        },
      },
      borderRadius: {
        DEFAULT: "4px",
        sm: "2px",
        md: "4px",
        lg: "6px",
        xl: "6px",
        "2xl": "8px",
        full: "9999px",
      },
    },
  },
  plugins: [],
};

export default config;
