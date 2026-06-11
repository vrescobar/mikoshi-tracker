"use client";

import { AuthForm } from "./auth-form";
import { LocaleSwitch, useLocale } from "../locale";
import { PageFrame, PageHeader, Surface } from "../ui";
import styles from "./auth-page.module.css";

export function AuthPageContent({ registrationEnabled }: { registrationEnabled: boolean }) {
  const { copy } = useLocale();

  return (
    <main className={styles.canvas}>
      <Surface variant="hero" className={styles.shell} data-testid="auth-shell">
        <PageFrame>
          <PageHeader
            eyebrow={copy.auth.page.eyebrow}
            title={copy.auth.page.title}
            description={copy.auth.page.description}
            actions={<LocaleSwitch />}
          />
          <AuthForm copy={copy.auth.form} registrationEnabled={registrationEnabled} />
        </PageFrame>
      </Surface>
    </main>
  );
}
