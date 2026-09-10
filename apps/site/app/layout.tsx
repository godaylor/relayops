import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./portfolio.css";

const basePath = process.env.NEXT_PUBLIC_RELAYOPS_BASE_PATH || "";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "RelayOps — Incident Operations",
    template: "%s | RelayOps",
  },
  description:
    "Self-hosted realtime incident operations, derived from the MIT-licensed Kaneo project.",
  keywords: [
    "RelayOps",
    "incident operations",
    "incident response",
    "realtime",
    "open source",
    "self-hosted",
  ],
  applicationName: "RelayOps",
  openGraph: {
    type: "website",
    siteName: "RelayOps",
    title: "RelayOps — Incident Operations",
    description:
      "Self-hosted realtime incident operations, derived from the MIT-licensed Kaneo project.",
  },
  twitter: {
    card: "summary_large_image",
    title: "RelayOps — Incident Operations",
    description:
      "Self-hosted realtime incident operations, derived from the MIT-licensed Kaneo project.",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: `${basePath}/favicon.svg`,
    shortcut: `${basePath}/favicon.svg`,
    apple: `${basePath}/apple-touch-icon.png`,
  },
  category: "productivity",
  creator: "RelayOps",
  publisher: "RelayOps",
};

const jsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "RelayOps",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "RelayOps",
    inLanguage: ["ru", "en"],
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "RelayOps",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, Linux, macOS, Windows",
    description:
      "Self-hosted realtime incident operations, derived from the MIT-licensed Kaneo project.",
    license: `${basePath}/licenses/LICENSE`,
  },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: This is necessary to apply the user's preferred color scheme before React hydration to prevent a flash of incorrect theme.
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var media = window.matchMedia('(prefers-color-scheme: dark)');
                  function applyTheme(isDark) {
                    document.documentElement.classList.toggle('dark', isDark);
                    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
                  }
                  applyTheme(media.matches);
                  if (media.addEventListener) {
                    media.addEventListener('change', function(e) { applyTheme(e.matches); });
                  } else if (media.addListener) {
                    media.addListener(function(e) { applyTheme(e.matches); });
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        {children}
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD structured data must be inlined as a script tag for search engines to parse.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </body>
    </html>
  );
}
