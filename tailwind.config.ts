import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        ink: { 950: "#070B14", 900: "#0B1220", 800: "#121B2E", 700: "#1C2740", 600: "#2A3756" },
        canvas: "#F5F7FB",
        line: "#E4E8F0",
        brand: { 50: "#EEF3FF", 100: "#DCE6FF", 200: "#B9CCFF", 400: "#5B82F5", 500: "#3461E8", 600: "#2449C9", 700: "#1D3AA3" },
        accent: { 500: "#0EA5A4", 600: "#0B8584" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)",
        lift: "0 8px 24px -8px rgba(16,24,40,0.18)",
        pop: "0 24px 48px -12px rgba(16,24,40,0.28)",
      },
      borderRadius: { xl: "0.875rem", "2xl": "1.125rem" },
      keyframes: {
        "fade-up": { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "slide-in": { "0%": { transform: "translateX(100%)" }, "100%": { transform: "translateX(0)" } },
        "scale-in": { "0%": { opacity: "0", transform: "scale(.97)" }, "100%": { opacity: "1", transform: "scale(1)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
      },
      animation: {
        "fade-up": "fade-up .45s cubic-bezier(.2,.7,.2,1) both",
        "slide-in": "slide-in .28s cubic-bezier(.2,.7,.2,1) both",
        "scale-in": "scale-in .18s ease-out both",
        "pulse-dot": "pulseDot 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
