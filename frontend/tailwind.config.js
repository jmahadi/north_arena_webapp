/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#DC6000',
        'primary-hover': '#FF7000',
        background: '#232323',
        surface: '#333333',
        'surface-light': '#444444',
      },
    },
  },
  plugins: [],
}