import typography from "@tailwindcss/typography"

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "var(--color-primary)",
          translucent: "var(--color-primary-translucent)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          light: "var(--color-secondary-light)",
          lighter: "var(--color-secondary-lighter)",
        },
        tetriary: {
          DEFAULT: "var(--color-tetriary)",
          light: "var(--color-tetriary-light)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          light: "var(--color-accent-light)",
        },
        foreground: {
          DEFAULT: "var(--color-foreground)",
          light: "var(--color-foreground-light)",
        },
      },
    },
  },
  plugins: [typography],
}
