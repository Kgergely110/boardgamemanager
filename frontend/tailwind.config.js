/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        "wood-dark": "#2c1810",
        "wood-medium": "#5a4a3a",
        "wood-light": "#9d8b7e",
        paper: "#f5f1ed",
        gold: "#d4af37",
      },
      fontFamily: {
        serif: ["Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
