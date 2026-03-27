import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#231f20",
        paper: "#f2f2f3",
        signal: "#7353f6",
        calm: "#5cc9f5",
        lavender: "#a78bff",
        graphite: "#2c2c2c",
        pale: "#e7e4ff"
      },
      keyframes: {
        pulseRing: {
          "0%": { transform: "scale(0.9)", opacity: "0.8" },
          "100%": { transform: "scale(1.2)", opacity: "0" }
        }
      },
      animation: {
        pulseRing: "pulseRing 1.4s ease-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
