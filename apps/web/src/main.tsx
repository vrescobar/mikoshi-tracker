import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/manrope";
import "./styles/globals.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { LocaleProvider } from "../components/locale";
import { resolveClientLocale } from "../lib/i18n/client";
import { router } from "./router";

const locale = resolveClientLocale();
document.documentElement.lang = locale;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider initialLocale={locale}>
      <RouterProvider router={router} />
    </LocaleProvider>
  </StrictMode>,
);
