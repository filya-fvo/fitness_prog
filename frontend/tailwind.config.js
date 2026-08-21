/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: "var(--app-bg, #07111f)",
          text: "var(--app-text, #eff7ff)",
          hint: "var(--app-hint, #91a4bd)",
          link: "var(--app-accent, #43c7ff)",
          button: "var(--app-button, #218ee5)",
          "button-text": "var(--app-button-text, #ffffff)",
          secondary: "var(--app-surface, #101f32)",
        },
      },
    },
  },
  plugins: [],
};
