import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const satoshi = localFont({
  variable: "--font-satoshi",
  display: "swap",
  src: [
    {
      path: "./fonts/Satoshi-Variable.woff2",
      style: "normal",
      weight: "300 900",
    },
    {
      path: "./fonts/Satoshi-VariableItalic.woff2",
      style: "italic",
      weight: "300 900",
    },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "Benefitsi Admin",
    template: "%s | Benefitsi Admin",
  },
  description: "Manage Benefitsi partners, deals, rewards, and menus.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${satoshi.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <template
          data-impeccable-contract="pinned-reference-20260814"
          dangerouslySetInnerHTML={{
            __html: `<!--
THESIS: Partner identity becomes a responsive benefit card; refuse the generic full-bleed restaurant hero.
OWN-WORLD: Three logo-derived colors, soft atmospheric fields, crisp white surfaces, compact iconography, and image-led depth.
STORY: Recognize the partner, confirm place and availability, see the benefit, then explore deals, services, story, and contact.
FIRST VIEWPORT: Partner copy and actions sit left of a large interactive image on desktop, stack above it on mobile, and resolve into four responsive benefit rows.
FORM: User-pinned responsive partner-card reference, first and binding direction; seed pinned-reference-20260814.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
