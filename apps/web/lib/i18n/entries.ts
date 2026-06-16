import type { SupportedLocale } from "./messages";

export type EntriesCopy = {
  page: {
    header: {
      eyebrow: string;
      description: string;
    };
    titles: {
      entries: string;
      habits: string;
      food: string;
    };
    emptyState: {
      title: string;
      description: string;
    };
  };
  habitCard: {
    noDescription: string;
    metaLabels: {
      frequency: string;
      target: string;
      startDate: string;
      state: string;
    };
    state: {
      active: string;
      archived: string;
    };
    frequency: {
      daily: string;
      perWeek: (count: number) => string;
      perMonth: (count: number) => string;
      selectedWeekdays: string;
    };
    target: {
      checkIn: string;
      units: string;
    };
    actions: {
      archive: string;
      restore: string;
    };
  };
  entryTypeBadge: {
    habit_boolean: string;
    habit_quantity: string;
    food_meal: string;
    weight_log: string;
    temptation: string;
    diet_goal: string;
    food_item: string;
    diet_prefs: string;
  };
  filter: {
    label: string;
    all: string;
  };
};

const entriesCopy: Record<SupportedLocale, EntriesCopy> = {
  en: {
    page: {
      header: {
        eyebrow: "Entries",
        description: "Review and manage your entries.",
      },
      titles: {
        entries: "Entries",
        habits: "Habits",
        food: "Food",
      },
      emptyState: {
        title: "No entries",
        description: "No entries match the current filters.",
      },
    },
    habitCard: {
      noDescription: "No description yet.",
      metaLabels: {
        frequency: "Frequency",
        target: "Target",
        startDate: "Start date",
        state: "State",
      },
      state: {
        active: "Active",
        archived: "Archived",
      },
      frequency: {
        daily: "Daily",
        perWeek: (count) => `${count}× per week`,
        perMonth: (count) => `${count}× per month`,
        selectedWeekdays: "Selected weekdays",
      },
      target: {
        checkIn: "Check-in",
        units: "units",
      },
      actions: {
        archive: "Archive",
        restore: "Restore",
      },
    },
    entryTypeBadge: {
      habit_boolean: "Check-in",
      habit_quantity: "Quantity",
      food_meal: "Food",
      weight_log: "Weight log",
      temptation: "Temptation",
      diet_goal: "Diet goal",
      food_item: "Food item",
      diet_prefs: "Diet preferences",
    },
    filter: {
      label: "Show",
      all: "All",
    },
  },
  "zh-CN": {
    page: {
      header: {
        eyebrow: "条目",
        description: "查看并管理你的条目。",
      },
      titles: {
        entries: "条目",
        habits: "习惯",
        food: "饮食",
      },
      emptyState: {
        title: "暂无条目",
        description: "没有符合当前筛选的条目。",
      },
    },
    habitCard: {
      noDescription: "暂时还没有描述。",
      metaLabels: {
        frequency: "频率",
        target: "目标",
        startDate: "开始日期",
        state: "状态",
      },
      state: {
        active: "启用中",
        archived: "已归档",
      },
      frequency: {
        daily: "每天",
        perWeek: (count) => `每周 ${count} 次`,
        perMonth: (count) => `每月 ${count} 次`,
        selectedWeekdays: "指定工作日",
      },
      target: {
        checkIn: "打卡型",
        units: "单位",
      },
      actions: {
        archive: "归档",
        restore: "恢复",
      },
    },
    entryTypeBadge: {
      habit_boolean: "打卡型",
      habit_quantity: "数值型",
      food_meal: "饮食",
      weight_log: "体重记录",
      temptation: "诱惑日志",
      diet_goal: "饮食目标",
      food_item: "食物条目",
      diet_prefs: "饮食偏好",
    },
    filter: {
      label: "显示",
      all: "全部",
    },
  },
  es: {
    page: {
      header: {
        eyebrow: "Entradas",
        description: "Revisa y gestiona tus entradas.",
      },
      titles: {
        entries: "Entradas",
        habits: "Hábitos",
        food: "Comida",
      },
      emptyState: {
        title: "Sin entradas",
        description: "Ninguna entrada coincide con los filtros actuales.",
      },
    },
    habitCard: {
      noDescription: "Aún sin descripción.",
      metaLabels: {
        frequency: "Frecuencia",
        target: "Objetivo",
        startDate: "Fecha de inicio",
        state: "Estado",
      },
      state: {
        active: "Activo",
        archived: "Archivado",
      },
      frequency: {
        daily: "Diario",
        perWeek: (count) => `${count}× por semana`,
        perMonth: (count) => `${count}× al mes`,
        selectedWeekdays: "Días de la semana seleccionados",
      },
      target: {
        checkIn: "Registro",
        units: "unidades",
      },
      actions: {
        archive: "Archivar",
        restore: "Restaurar",
      },
    },
    entryTypeBadge: {
      habit_boolean: "Registro",
      habit_quantity: "Cantidad",
      food_meal: "Comida",
      weight_log: "Registro de peso",
      temptation: "Tentación",
      diet_goal: "Objetivo de dieta",
      food_item: "Alimento",
      diet_prefs: "Preferencias de dieta",
    },
    filter: {
      label: "Mostrar",
      all: "Todas",
    },
  },
};

export function getEntriesCopy(locale: SupportedLocale): EntriesCopy {
  return entriesCopy[locale];
}
