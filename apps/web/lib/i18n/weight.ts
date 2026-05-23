import type { SupportedLocale } from "./messages";

export type WeightCopy = {
  page: {
    eyebrow: string;
    title: string;
    description: string;
    emptyState: { title: string; description: string };
    logButton: string;
    logButtonSaving: string;
    viewAll: string;
  };
  form: {
    weightKg: string;
    notes: string;
    notesPlaceholder: string;
    save: string;
    cancel: string;
    errorRequired: string;
    errorPositive: string;
  };
  trend: {
    title: string;
    empty: string;
    label: string;
  };
  table: {
    date: string;
    weight: string;
    notes: string;
    actions: string;
    edit: string;
    delete: string;
    confirmDelete: string;
    undoDeletion: string;
  };
  dashboard: {
    eyebrow: string;
    title: string;
    latestLabel: string;
    logWeight: string;
  };
};

const weightCopy: Record<SupportedLocale, WeightCopy> = {
  en: {
    page: {
      eyebrow: "Weight",
      title: "Weight log",
      description: "Track your weight over time.",
      emptyState: {
        title: "No weight logged yet",
        description: "Log your first weight entry to start tracking.",
      },
      logButton: "Log weight",
      logButtonSaving: "Saving…",
      viewAll: "View all →",
    },
    form: {
      weightKg: "Weight (kg)",
      notes: "Notes",
      notesPlaceholder: "Optional notes",
      save: "Save",
      cancel: "Cancel",
      errorRequired: "Weight is required.",
      errorPositive: "Weight must be a positive number.",
    },
    trend: {
      title: "Trend",
      empty: "No data to display.",
      label: "kg",
    },
    table: {
      date: "Date",
      weight: "Weight",
      notes: "Notes",
      actions: "Actions",
      edit: "Edit",
      delete: "Delete",
      confirmDelete: "Confirm delete",
      undoDeletion: "Undo deletion",
    },
    dashboard: {
      eyebrow: "Weight",
      title: "Latest weight",
      latestLabel: "kg",
      logWeight: "Log weight →",
    },
  },
  "zh-CN": {
    page: {
      eyebrow: "体重",
      title: "体重记录",
      description: "追踪你的体重变化。",
      emptyState: {
        title: "还没有体重记录",
        description: "记录第一条体重数据，开始追踪吧。",
      },
      logButton: "记录体重",
      logButtonSaving: "保存中…",
      viewAll: "查看全部 →",
    },
    form: {
      weightKg: "体重（kg）",
      notes: "备注",
      notesPlaceholder: "可选备注",
      save: "保存",
      cancel: "取消",
      errorRequired: "请输入体重。",
      errorPositive: "体重必须为正数。",
    },
    trend: {
      title: "趋势",
      empty: "暂无数据。",
      label: "kg",
    },
    table: {
      date: "日期",
      weight: "体重",
      notes: "备注",
      actions: "操作",
      edit: "编辑",
      delete: "删除",
      confirmDelete: "确认删除",
      undoDeletion: "撤销删除",
    },
    dashboard: {
      eyebrow: "体重",
      title: "最新体重",
      latestLabel: "kg",
      logWeight: "记录体重 →",
    },
  },
  es: {
    page: {
      eyebrow: "Peso",
      title: "Registro de peso",
      description: "Realiza un seguimiento de tu peso a lo largo del tiempo.",
      emptyState: {
        title: "Sin registros de peso",
        description: "Registra tu primer peso para empezar a hacer seguimiento.",
      },
      logButton: "Registrar peso",
      logButtonSaving: "Guardando…",
      viewAll: "Ver todo →",
    },
    form: {
      weightKg: "Peso (kg)",
      notes: "Notas",
      notesPlaceholder: "Notas opcionales",
      save: "Guardar",
      cancel: "Cancelar",
      errorRequired: "El peso es obligatorio.",
      errorPositive: "El peso debe ser un número positivo.",
    },
    trend: {
      title: "Tendencia",
      empty: "Sin datos que mostrar.",
      label: "kg",
    },
    table: {
      date: "Fecha",
      weight: "Peso",
      notes: "Notas",
      actions: "Acciones",
      edit: "Editar",
      delete: "Eliminar",
      confirmDelete: "Confirmar eliminación",
      undoDeletion: "Deshacer eliminación",
    },
    dashboard: {
      eyebrow: "Peso",
      title: "Último peso",
      latestLabel: "kg",
      logWeight: "Registrar peso →",
    },
  },
};

export function getWeightCopy(locale: SupportedLocale): WeightCopy {
  return weightCopy[locale];
}
