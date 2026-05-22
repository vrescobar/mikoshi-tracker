import type { SupportedLocale } from "./messages";

export type FoodCopy = {
  page: {
    header: {
      eyebrow: string;
      title: string;
      description: string;
    };
    toolbar: {
      dateLabel: string;
      addFood: string;
      addFoodComingSoon: string;
    };
    totals: {
      label: string;
      kcal: string;
      protein: string;
      carbs: string;
      fat: string;
      fiber: string;
    };
    emptyState: {
      title: string;
      description: string;
    };
    card: {
      viewDetail: string;
      deletedBadge: string;
    };
  };
  detail: {
    backToFood: string;
    header: {
      eyebrow: string;
    };
    photo: {
      title: string;
      noPhoto: string;
    };
    fields: {
      name: string;
      kcal: string;
      protein_g: string;
      carbs_g: string;
      fat_g: string;
      fiber_g: string;
      sugar_g: string;
      portion_g: string;
      mealSlot: string;
      notes: string;
      source: string;
      confidence: string;
    };
    mealSlots: {
      breakfast: string;
      lunch: string;
      snack: string;
      dinner: string;
      other: string;
      none: string;
    };
    sources: {
      label: string;
      similar_to_event: string;
      web_lookup: string;
      vision_only: string;
      manual: string;
    };
    edit: {
      editLabel: string;
      saveLabel: string;
      cancelLabel: string;
      saving: string;
      errorTitle: string;
      validationKcal: string;
      validationName: string;
      validationMacro: string;
    };
    deleteSection: {
      title: string;
      description: string;
      deleteLabel: string;
      confirmLabel: string;
      cancelLabel: string;
      deletedTitle: string;
      deletedDescription: string;
      undoLabel: string;
      errorTitle: string;
    };
    mutations: {
      title: string;
      emptyState: string;
      types: {
        CREATE: string;
        UPDATE: string;
        DELETE: string;
        UNDO: string;
      };
      sources: {
        WEB: string;
        AI: string;
        SYSTEM: string;
        CIRCLE: string;
      };
    };
  };
  dialog: {
    title: string;
    description: string;
    submitLabel: string;
    submittingLabel: string;
    cancelLabel: string;
    errorTitle: string;
  };
  insights: {
    header: {
      eyebrow: string;
      title: string;
      description: string;
    };
    rangePicker: {
      fromLabel: string;
      toLabel: string;
      applyLabel: string;
    };
    heatmap: {
      title: string;
      description: string;
      noData: string;
      legend: {
        none: string;
        low: string;
        medium: string;
        high: string;
      };
    };
    summary: {
      title: string;
      totalKcal: string;
      totalDays: string;
      avgKcal: string;
      meals: string;
    };
    repeatedMeals: {
      title: string;
      description: string;
      emptyState: string;
      timesLabel: (count: number) => string;
    };
    missingDays: {
      title: string;
      description: string;
      emptyState: string;
    };
  };
};

const foodCopy: Record<SupportedLocale, FoodCopy> = {
  en: {
    page: {
      header: {
        eyebrow: "Nutrition",
        title: "Food",
        description: "Today's food log — meals and snacks recorded so far.",
      },
      toolbar: {
        dateLabel: "Today",
        addFood: "Add food",
        addFoodComingSoon: "Add food (coming soon)",
      },
      totals: {
        label: "Today's totals",
        kcal: "kcal",
        protein: "Protein",
        carbs: "Carbs",
        fat: "Fat",
        fiber: "Fiber",
      },
      emptyState: {
        title: "Nothing logged yet",
        description: "Log your meals via WhatsApp to see them here.",
      },
      card: {
        viewDetail: "View details",
        deletedBadge: "Deleted",
      },
    },
    detail: {
      backToFood: "← Back to food",
      header: {
        eyebrow: "Food entry",
      },
      photo: {
        title: "Photo",
        noPhoto: "No photo attached.",
      },
      fields: {
        name: "Name",
        kcal: "Calories (kcal)",
        protein_g: "Protein (g)",
        carbs_g: "Carbs (g)",
        fat_g: "Fat (g)",
        fiber_g: "Fiber (g)",
        sugar_g: "Sugar (g)",
        portion_g: "Portion (g)",
        mealSlot: "Meal slot",
        notes: "Notes",
        source: "Source",
        confidence: "Confidence",
      },
      mealSlots: {
        breakfast: "Breakfast",
        lunch: "Lunch",
        snack: "Snack",
        dinner: "Dinner",
        other: "Other",
        none: "Unspecified",
      },
      sources: {
        label: "Label scan",
        similar_to_event: "Similar to past meal",
        web_lookup: "Web lookup",
        vision_only: "Photo estimate",
        manual: "Manual",
      },
      edit: {
        editLabel: "Edit",
        saveLabel: "Save",
        cancelLabel: "Cancel",
        saving: "Saving…",
        errorTitle: "Unable to save",
        validationKcal: "Calories must be 0 or higher.",
        validationName: "Name is required.",
        validationMacro: "Macro values must be 0 or higher.",
      },
      deleteSection: {
        title: "Delete entry",
        description:
          "Deleting this entry keeps the audit trail intact — the record is soft-deleted and visible in the mutations history below.",
        deleteLabel: "Delete",
        confirmLabel: "Confirm delete",
        cancelLabel: "Cancel",
        deletedTitle: "This entry has been deleted",
        deletedDescription: "It remains in the audit trail. You can undo the deletion below.",
        undoLabel: "Undo deletion",
        errorTitle: "Unable to delete",
      },
      mutations: {
        title: "Audit trail",
        emptyState: "No mutations yet.",
        types: {
          CREATE: "Created",
          UPDATE: "Updated",
          DELETE: "Deleted",
          UNDO: "Undone",
        },
        sources: {
          WEB: "Web",
          AI: "AI",
          SYSTEM: "System",
          CIRCLE: "Circle",
        },
      },
    },
    dialog: {
      title: "Add food",
      description: "Record a meal manually. This adds it to your food log and updates today's nutrition totals.",
      submitLabel: "Add",
      submittingLabel: "Adding…",
      cancelLabel: "Cancel",
      errorTitle: "Could not add food",
    },
    insights: {
      header: {
        eyebrow: "Nutrition insights",
        title: "Food insights",
        description: "Trends, gaps, and repeated meals over a selected date range.",
      },
      rangePicker: {
        fromLabel: "From",
        toLabel: "To",
        applyLabel: "Apply",
      },
      heatmap: {
        title: "Calorie heatmap",
        description: "Each cell is one day. Colour intensity represents kcal logged.",
        noData: "No food data in this range.",
        legend: {
          none: "No data",
          low: "< 1 000 kcal",
          medium: "1 000 – 2 000 kcal",
          high: "> 2 000 kcal",
        },
      },
      summary: {
        title: "Range summary",
        totalKcal: "Total kcal",
        totalDays: "Days logged",
        avgKcal: "Avg kcal / day",
        meals: "Total meals",
      },
      repeatedMeals: {
        title: "Frequent meals",
        description: "Meals you have logged more than once, grouped by name.",
        emptyState: "No repeated meals in this range.",
        timesLabel: (count) => `${count}×`,
      },
      missingDays: {
        title: "Days without data",
        description: "Days in the selected range with no food logged.",
        emptyState: "Every day in this range has at least one entry.",
      },
    },
  },
  "zh-CN": {
    page: {
      header: {
        eyebrow: "营养",
        title: "饮食",
        description: "今日饮食记录——目前已记录的正餐和零食。",
      },
      toolbar: {
        dateLabel: "今天",
        addFood: "添加食物",
        addFoodComingSoon: "添加食物（即将上线）",
      },
      totals: {
        label: "今日合计",
        kcal: "千卡",
        protein: "蛋白质",
        carbs: "碳水",
        fat: "脂肪",
        fiber: "膳食纤维",
      },
      emptyState: {
        title: "今天还没有记录",
        description: "通过 WhatsApp 记录你的饮食，它们会显示在这里。",
      },
      card: {
        viewDetail: "查看详情",
        deletedBadge: "已删除",
      },
    },
    detail: {
      backToFood: "← 返回饮食",
      header: {
        eyebrow: "饮食条目",
      },
      photo: {
        title: "照片",
        noPhoto: "没有附加照片。",
      },
      fields: {
        name: "名称",
        kcal: "热量（千卡）",
        protein_g: "蛋白质（克）",
        carbs_g: "碳水化合物（克）",
        fat_g: "脂肪（克）",
        fiber_g: "膳食纤维（克）",
        sugar_g: "糖（克）",
        portion_g: "份量（克）",
        mealSlot: "用餐时段",
        notes: "备注",
        source: "数据来源",
        confidence: "置信度",
      },
      mealSlots: {
        breakfast: "早餐",
        lunch: "午餐",
        snack: "小食",
        dinner: "晚餐",
        other: "其他",
        none: "未指定",
      },
      sources: {
        label: "标签扫描",
        similar_to_event: "与历史记录相似",
        web_lookup: "网络查询",
        vision_only: "照片估算",
        manual: "手动输入",
      },
      edit: {
        editLabel: "编辑",
        saveLabel: "保存",
        cancelLabel: "取消",
        saving: "保存中…",
        errorTitle: "暂时无法保存",
        validationKcal: "热量必须大于等于 0。",
        validationName: "名称不能为空。",
        validationMacro: "营养素数值必须大于等于 0。",
      },
      deleteSection: {
        title: "删除条目",
        description: "删除操作会保留审计记录——条目会被软删除，仍可在下方的变更历史中查看。",
        deleteLabel: "删除",
        confirmLabel: "确认删除",
        cancelLabel: "取消",
        deletedTitle: "该条目已被删除",
        deletedDescription: "它仍保存在审计记录中。你可以在下方撤销此次删除。",
        undoLabel: "撤销删除",
        errorTitle: "暂时无法删除",
      },
      mutations: {
        title: "审计记录",
        emptyState: "暂无变更记录。",
        types: {
          CREATE: "已创建",
          UPDATE: "已更新",
          DELETE: "已删除",
          UNDO: "已撤销",
        },
        sources: {
          WEB: "网页",
          AI: "AI",
          SYSTEM: "系统",
          CIRCLE: "圈子",
        },
      },
    },
    dialog: {
      title: "添加食物",
      description: "手动记录一餐。记录后将添加到你的饮食日志，并更新今日营养汇总。",
      submitLabel: "添加",
      submittingLabel: "添加中…",
      cancelLabel: "取消",
      errorTitle: "无法添加食物",
    },
    insights: {
      header: {
        eyebrow: "营养洞察",
        title: "饮食洞察",
        description: "在所选日期范围内的趋势、缺口和重复餐食。",
      },
      rangePicker: {
        fromLabel: "开始日期",
        toLabel: "结束日期",
        applyLabel: "应用",
      },
      heatmap: {
        title: "热量热力图",
        description: "每个格子代表一天，颜色深浅表示当天记录的热量。",
        noData: "该范围内没有饮食数据。",
        legend: {
          none: "无数据",
          low: "< 1000 千卡",
          medium: "1000–2000 千卡",
          high: "> 2000 千卡",
        },
      },
      summary: {
        title: "范围汇总",
        totalKcal: "总热量",
        totalDays: "已记录天数",
        avgKcal: "平均热量/天",
        meals: "总餐数",
      },
      repeatedMeals: {
        title: "常吃食物",
        description: "记录超过一次的餐食，按名称分组。",
        emptyState: "该范围内没有重复餐食。",
        timesLabel: (count) => `${count} 次`,
      },
      missingDays: {
        title: "未记录日期",
        description: "所选范围内没有饮食记录的天数。",
        emptyState: "该范围内每天都有至少一条记录。",
      },
    },
  },
  es: {
    page: {
      header: {
        eyebrow: "Nutrición",
        title: "Comida",
        description: "Registro de comida de hoy — comidas y aperitivos registrados hasta ahora.",
      },
      toolbar: {
        dateLabel: "Hoy",
        addFood: "Añadir comida",
        addFoodComingSoon: "Añadir comida (próximamente)",
      },
      totals: {
        label: "Totales de hoy",
        kcal: "kcal",
        protein: "Proteína",
        carbs: "Carbohidratos",
        fat: "Grasa",
        fiber: "Fibra",
      },
      emptyState: {
        title: "Nada registrado aún",
        description: "Registra tus comidas vía WhatsApp para verlas aquí.",
      },
      card: {
        viewDetail: "Ver detalles",
        deletedBadge: "Eliminado",
      },
    },
    detail: {
      backToFood: "← Volver a comida",
      header: {
        eyebrow: "Entrada de comida",
      },
      photo: {
        title: "Foto",
        noPhoto: "Sin foto adjunta.",
      },
      fields: {
        name: "Nombre",
        kcal: "Calorías (kcal)",
        protein_g: "Proteína (g)",
        carbs_g: "Carbohidratos (g)",
        fat_g: "Grasa (g)",
        fiber_g: "Fibra (g)",
        sugar_g: "Azúcar (g)",
        portion_g: "Porción (g)",
        mealSlot: "Momento del día",
        notes: "Notas",
        source: "Fuente",
        confidence: "Confianza",
      },
      mealSlots: {
        breakfast: "Desayuno",
        lunch: "Almuerzo",
        snack: "Aperitivo",
        dinner: "Cena",
        other: "Otro",
        none: "Sin especificar",
      },
      sources: {
        label: "Etiqueta escaneada",
        similar_to_event: "Similar a comida pasada",
        web_lookup: "Búsqueda web",
        vision_only: "Estimación por foto",
        manual: "Manual",
      },
      edit: {
        editLabel: "Editar",
        saveLabel: "Guardar",
        cancelLabel: "Cancelar",
        saving: "Guardando…",
        errorTitle: "No se puede guardar",
        validationKcal: "Las calorías deben ser 0 o más.",
        validationName: "El nombre es obligatorio.",
        validationMacro: "Los valores de macros deben ser 0 o más.",
      },
      deleteSection: {
        title: "Eliminar entrada",
        description:
          "Eliminar esta entrada conserva el registro de auditoría — el registro se elimina de forma blanda y es visible en el historial de cambios abajo.",
        deleteLabel: "Eliminar",
        confirmLabel: "Confirmar eliminación",
        cancelLabel: "Cancelar",
        deletedTitle: "Esta entrada ha sido eliminada",
        deletedDescription: "Permanece en el registro de auditoría. Puedes deshacer la eliminación abajo.",
        undoLabel: "Deshacer eliminación",
        errorTitle: "No se puede eliminar",
      },
      mutations: {
        title: "Registro de auditoría",
        emptyState: "Sin cambios registrados.",
        types: {
          CREATE: "Creado",
          UPDATE: "Actualizado",
          DELETE: "Eliminado",
          UNDO: "Deshecho",
        },
        sources: {
          WEB: "Web",
          AI: "IA",
          SYSTEM: "Sistema",
          CIRCLE: "Círculo",
        },
      },
    },
    dialog: {
      title: "Añadir comida",
      description: "Registra una comida manualmente. Se añadirá a tu registro de comida y actualizará los totales nutricionales de hoy.",
      submitLabel: "Añadir",
      submittingLabel: "Añadiendo…",
      cancelLabel: "Cancelar",
      errorTitle: "No se pudo añadir la comida",
    },
    insights: {
      header: {
        eyebrow: "Análisis nutricional",
        title: "Análisis de comida",
        description: "Tendencias, vacíos y comidas repetidas en un rango de fechas seleccionado.",
      },
      rangePicker: {
        fromLabel: "Desde",
        toLabel: "Hasta",
        applyLabel: "Aplicar",
      },
      heatmap: {
        title: "Mapa de calor calórico",
        description: "Cada celda es un día. La intensidad del color representa las kcal registradas.",
        noData: "Sin datos de comida en este rango.",
        legend: {
          none: "Sin datos",
          low: "< 1 000 kcal",
          medium: "1 000 – 2 000 kcal",
          high: "> 2 000 kcal",
        },
      },
      summary: {
        title: "Resumen del rango",
        totalKcal: "kcal totales",
        totalDays: "Días registrados",
        avgKcal: "Promedio kcal / día",
        meals: "Total de comidas",
      },
      repeatedMeals: {
        title: "Comidas frecuentes",
        description: "Comidas registradas más de una vez, agrupadas por nombre.",
        emptyState: "No hay comidas repetidas en este rango.",
        timesLabel: (count) => `${count}×`,
      },
      missingDays: {
        title: "Días sin datos",
        description: "Días en el rango seleccionado sin ninguna comida registrada.",
        emptyState: "Todos los días en este rango tienen al menos una entrada.",
      },
    },
  },
};

export function getFoodCopy(locale: SupportedLocale): FoodCopy {
  return foodCopy[locale];
}
