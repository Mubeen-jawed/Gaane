import "./globals.css";

export const metadata = {
  title: "Gaane",
  description: "Distraction-free music player",
};

export const viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
