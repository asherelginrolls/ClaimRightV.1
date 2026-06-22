import type { Config } from "tailwindcss";

// ── Ashray "Dawn Sky" design system ──────────────────────────────────────────
// A hopeful new-morning palette: white + sky/light blue + sunshine gold.
// No orange, no cream/off-white base. Sky/blue/slate are nested objects so
// Tailwind's deep-merge keeps the default numeric shades intact.
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#FFFFFF",
        mist: "#F4FAFE", // page base — faint sky-tinted white (never cream)
        navy: "#0B2138", // deep dawn navy for dark sections
        sky: { DEFAULT: "#BFE0F7", tint: "#EAF4FC", wash: "#D9EEFB", top: "#5AA0DC" },
        blue: { DEFAULT: "#2C7BC0", deep: "#1F5E97", bright: "#3E92D9" },
        ink: { DEFAULT: "#0E2C45", deep: "#103C63" },
        slate: { DEFAULT: "#3D5B72", muted: "#5C7A92", faint: "#9CB4C8" },
        sun: { DEFAULT: "#FFCB52", soft: "#FFD9A8" },
        gold: { DEFAULT: "#E0A21E", ink: "#C58A3D" },
        hope: { DEFAULT: "#1E9E73", soft: "#5BD0A0" }, // success / "strong" green
        coral: { DEFAULT: "#FFB199", deep: "#E7886F" }, // calm "difficult" band — never red
        rule: { DEFAULT: "#E3EEF7", strong: "#D8E8F4", soft: "#CFE2F2" },
      },
      fontFamily: {
        display: ["var(--font-display)", "Newsreader", "Georgia", "serif"],
        decay: ["var(--font-decay)", "Newsreader", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        lift: "0 1px 2px rgba(14,42,69,0.04), 0 8px 24px -12px rgba(14,42,69,0.18)",
        liftlg: "0 2px 4px rgba(14,42,69,0.05), 0 24px 48px -20px rgba(14,42,69,0.25)",
        glow: "0 0 64px -12px rgba(255,203,82,0.55)",
        ring: "0 0 0 4px rgba(44,123,192,0.12)",
      },
      backgroundImage: {
        "dawn": "linear-gradient(180deg,#5AA0DC 0%,#BFE0F7 55%,#FFFFFF 100%)",
        "dawn-soft": "linear-gradient(180deg,#EAF4FC 0%,#F4FAFE 60%,#FFFFFF 100%)",
      },
      keyframes: {
        sunpulse: { "0%,100%": { opacity: "0.82" }, "50%": { opacity: "1" } },
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        rise: { from: { opacity: "0", transform: "translateY(14px)" }, to: { opacity: "1", transform: "none" } },
        drift: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
      },
      animation: {
        sunpulse: "sunpulse 7s ease-in-out infinite",
        blink: "blink 1s ease-in-out infinite",
        rise: "rise 0.7s cubic-bezier(0.22,1,0.36,1) both",
        drift: "drift 60s linear infinite",
        floaty: "floaty 8s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
