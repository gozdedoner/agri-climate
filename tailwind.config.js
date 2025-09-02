/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts}"],
  theme: {
    extend: {
      colors: {
        apricot: "#F6A66A",
        latte:   "#D8C3A5",
        blush:   "#FCE8D8",
      },
      boxShadow: { soft: "0 10px 30px rgba(0,0,0,0.10)" }
    }
  },
  plugins: [require('@tailwindcss/typography')],
}
