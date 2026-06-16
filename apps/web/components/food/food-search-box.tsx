import type { FoodSearchResult } from "@mikoshi-tracker/contracts/food";
import { useEffect, useRef, useState } from "react";

import { relogFood, searchFoods } from "../../lib/diet-client";
import type { SupportedLocale } from "../../lib/i18n/messages";
import { useLocale } from "../locale";
import { Button, Icon, Input, Surface } from "../ui";
import styles from "./food-search-box.module.css";

type Copy = {
  label: string;
  placeholder: string;
  empty: string;
  searching: string;
  relog: string;
  relogging: string;
  hint: string;
};

const COPY: Record<SupportedLocale, Copy> = {
  en: {
    label: "Quick re-log",
    placeholder: "Search a food you've logged before…",
    empty: "No matches yet — keep typing.",
    searching: "Searching…",
    relog: "Log again",
    relogging: "Logging…",
    hint: "Or ask Mikoshi on WhatsApp to log it for you.",
  },
  "zh-CN": {
    label: "快速再记录",
    placeholder: "搜索你之前记录过的食物…",
    empty: "暂无匹配，继续输入。",
    searching: "搜索中…",
    relog: "再记录",
    relogging: "记录中…",
    hint: "或在 WhatsApp 上让 Mikoshi 帮你记录。",
  },
  es: {
    label: "Re-registro rápido",
    placeholder: "Busca una comida que ya registraste…",
    empty: "Sin coincidencias todavía — sigue escribiendo.",
    searching: "Buscando…",
    relog: "Registrar de nuevo",
    relogging: "Registrando…",
    hint: "O pídele a Mikoshi por WhatsApp que la registre por ti.",
  },
};

export function FoodSearchBox({ onLogged }: { onLogged?: () => void }) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [relogging, setRelogging] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(() => {
      let cancelled = false;
      void searchFoods(trimmed)
        .then((hits) => {
          if (!cancelled) setResults(hits);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
      return () => {
        cancelled = true;
      };
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  async function handleRelog(result: FoodSearchResult) {
    setRelogging(result.eventId);
    try {
      await relogFood({ sourceEventId: result.eventId });
      setQuery("");
      setResults([]);
      onLogged?.();
    } catch {
      // Leave the row in place; the user can retry.
    } finally {
      setRelogging(null);
    }
  }

  const trimmed = query.trim();
  const showPanel = trimmed.length >= 2;

  return (
    <Surface variant="panel" padding="md" className={styles.box} data-testid="food-search-box">
      <label className={styles.label} htmlFor="food-search">
        {copy.label}
      </label>
      <div className={styles.inputRow}>
        <span className={styles.searchIcon} aria-hidden="true">
          <Icon name="diet" size="1.05rem" />
        </span>
        <Input
          id="food-search"
          value={query}
          placeholder={copy.placeholder}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {showPanel ? (
        <div className={styles.results}>
          {searching && results.length === 0 ? (
            <p className={styles.muted}>{copy.searching}</p>
          ) : results.length === 0 ? (
            <p className={styles.muted}>{copy.empty}</p>
          ) : (
            <ul className={styles.list}>
              {results.map((result) => (
                <li key={result.eventId} className={styles.row}>
                  <div className={styles.meta}>
                    <span className={styles.name}>{result.name}</span>
                    <span className={styles.macros}>
                      {Math.round(result.kcal)} kcal · {Math.round(result.usageCount)}×
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={relogging !== null}
                    onClick={() => void handleRelog(result)}
                  >
                    {relogging === result.eventId ? copy.relogging : copy.relog}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className={styles.hint}>{copy.hint}</p>
        </div>
      ) : null}
    </Surface>
  );
}
