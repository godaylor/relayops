import path from "node:path";
import babel from "@rolldown/plugin-babel";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import en from "../../i18n/en-US.json";
import ru from "../../i18n/ru-RU.json";
import packageJson from "../../package.json";
import { installStartupRecovery } from "./src/lib/startup-recovery";

const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  base: "/",
  plugins: [
    {
      name: "startup-recovery",
      transformIndexHtml: {
        order: "post",
        handler: (html) =>
          html.replace(
            "<!-- startup-recovery -->",
            `<script>(${installStartupRecovery.toString()})(${JSON.stringify({
              "en-US": {
                appName: en.common.appName,
                title: en.common.error.title,
                description: en.common.error.description,
                refreshPage: en.common.error.refreshPage,
              },
              "ru-RU": {
                appName: ru.common.appName,
                title: ru.common.error.title,
                description: ru.common.error.description,
                refreshPage: ru.common.error.refreshPage,
              },
            }).replace(/</g, "\\u003c")})</script>`,
          ),
      },
    },
    tanstackRouter({
      autoCodeSplitting: true,
      // Keep co-located route tests out of the generated route tree.
      routeFileIgnorePattern: "\\.test\\.tsx?$",
    }),
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    // Hidden when Sentry env vars are absent so local dev does not depend on it.
    ...(sentryAuthToken && sentryOrg && sentryProject
      ? [
          sentryVitePlugin({
            authToken: sentryAuthToken,
            org: sentryOrg,
            project: sentryProject,
            release: { name: packageJson.version },
          }),
        ]
      : []),
  ],
  server: {
    host: "127.0.0.1",
    hmr: true,
    port: Number(process.env.RELAYOPS_WEB_PORT ?? 32000),
    strictPort: true,
  },
  preview: { host: "127.0.0.1", port: 32070, strictPort: true },
  optimizeDeps: {
    exclude: ["better-auth"],
  },
  ssr: {
    noExternal: ["better-auth"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@i18n": path.resolve(__dirname, "../../i18n"),
    },
  },
  build: {
    // Source maps are required for the Sentry Vite plugin to upload and
    // symbolicate stack traces. Hidden so the .map files are not served
    // to end users; the Sentry plugin still attaches them to uploaded
    // releases.
    sourcemap: "hidden",
    rollupOptions: {},
    commonjsOptions: {
      include: [/better-auth/, /node_modules/],
      transformMixedEsModules: true,
    },
    target: "esnext",
  },
});
