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
    repeats: {
      title: string;
      description: string;
      empty: string;
      logAgain: string;
      logging: string;
      errorTitle: string;
    };
  };
  today: {
    trendTitle: string;
    trendEmpty: string;
    goalLineLabel: string;
    goalsTitle: string;
    remaining: string;
    over: string;
    of: string;
    left: string;
    noTargetTitle: string;
    noTargetBody: string;
    setGoal: string;
    mealsTitle: string;
    edit: string;
    delete: string;
    confirmDelete: string;
    cancel: string;
    save: string;
    saving: string;
    deleting: string;
    deleteError: string;
    saveError: string;
    changeTimeHint: string;
  };
  explore: {
    title: string;
    description: string;
    searchTitle: string;
    favoritesTitle: string;
    historyTitle: string;
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
      diff: {
        noChanges: string;
        added: string;
        removed: string;
        unchanged: string;
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
    photoLabel: string;
    photoHint: string;
    photoUploadFailed: string;
    tabs: {
      manual: string;
      photo: string;
      text: string;
    };
    skill: {
      photoSubmitLabel: string;
      textSubmitLabel: string;
      textPlaceholder: string;
      runningLabel: string;
      proposalTitle: string;
      proposalDescription: string;
      acceptLabel: string;
      acceptingLabel: string;
      discardLabel: string;
      needsEnrolment: string;
      genericError: string;
    };
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
    controls: {
      rangeLabel: string;
      last7: string;
      last30: string;
      last90: string;
      granularityLabel: string;
      day: string;
      week: string;
      month: string;
    };
    dailyIntake: {
      title: string;
      description: string;
      empty: string;
      kcalLabel: string;
      targetLabel: string;
      averageLabel: string;
      legend: { protein: string; carbs: string; fat: string };
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
      avgUnit: { day: string; week: string; month: string };
      loggedUnit: { day: string; week: string; month: string };
    };
    macroPie: {
      title: string;
      description: string;
      empty: string;
      caption: string;
      legend: { protein: string; carbs: string; fat: string };
    };
    kcalTrend: {
      title: string;
      description: string;
      empty: string;
      label: string;
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
      repeats: {
        title: "Repeats",
        description: "Meals you have logged in the last 30 days. Tap “Log again” to add today.",
        empty: "Nothing recurrent yet — log a few meals to see suggestions here.",
        logAgain: "Log again",
        logging: "Logging…",
        errorTitle: "Could not log meal",
      },
    },
    today: {
      trendTitle: "Last 7 days",
      trendEmpty: "No meals logged this week yet.",
      goalLineLabel: "Goal",
      goalsTitle: "Today vs your goal",
      remaining: "kcal left",
      over: "kcal over",
      of: "of",
      left: "left",
      noTargetTitle: "No daily goal yet",
      noTargetBody: "Set a calorie and macro target to track today against it.",
      setGoal: "Set a goal",
      mealsTitle: "Today's meals",
      edit: "Edit",
      delete: "Delete",
      confirmDelete: "Delete this meal?",
      cancel: "Cancel",
      save: "Save",
      saving: "Saving…",
      deleting: "Deleting…",
      deleteError: "Couldn't delete the meal.",
      saveError: "Couldn't save the changes.",
      changeTimeHint: "Logged at the time shown — edit a meal to adjust it.",
    },
    explore: {
      title: "Explore",
      description: "Search your foods, re-log favourites, and review your history.",
      searchTitle: "Search & re-log",
      favoritesTitle: "Favourites",
      historyTitle: "History & trends",
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
        diff: {
          noChanges: "No payload changes",
          added: "added",
          removed: "removed",
          unchanged: "unchanged",
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
      photoLabel: "Photo (optional)",
      photoHint: "Attach an image of the meal — uploaded after the meal is saved.",
      photoUploadFailed: "Meal saved, but the photo upload failed.",
      tabs: {
        manual: "Manual",
        photo: "Photo",
        text: "Text",
      },
      skill: {
        photoSubmitLabel: "Identify from photo",
        textSubmitLabel: "Parse text",
        textPlaceholder: "e.g. Tuna salad with two slices of bread",
        runningLabel: "Asking the food skill…",
        proposalTitle: "Confirm this meal",
        proposalDescription: "The food skill suggests these values. Edit anything that looks off, then accept.",
        acceptLabel: "Accept and save",
        acceptingLabel: "Saving…",
        discardLabel: "Discard",
        needsEnrolment: "The food skill is not enrolled yet. Open Settings → Skills to connect it.",
        genericError: "The food skill could not process this input.",
      },
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
      controls: {
        rangeLabel: "Range",
        last7: "7 days",
        last30: "30 days",
        last90: "90 days",
        granularityLabel: "Group by",
        day: "Day",
        week: "Week",
        month: "Month",
      },
      dailyIntake: {
        title: "Daily intake",
        description: "Calories per day, broken down by macros, against your goal and average.",
        empty: "No data yet — log a meal to start your intake chart.",
        kcalLabel: "kcal",
        targetLabel: "Goal",
        averageLabel: "Avg",
        legend: { protein: "Protein", carbs: "Carbs", fat: "Fat" },
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
        avgUnit: { day: "Avg kcal / day", week: "Avg kcal / week", month: "Avg kcal / month" },
        loggedUnit: { day: "Days logged", week: "Weeks logged", month: "Months logged" },
      },
      macroPie: {
        title: "Macro distribution",
        description: "Protein / carbs / fat as a share of total kcal across the selected range.",
        empty: "Log a meal to see your macro distribution.",
        caption: "kcal",
        legend: { protein: "Protein", carbs: "Carbs", fat: "Fat" },
      },
      kcalTrend: {
        title: "Kcal trend",
        description: "Calories per day across the selected range.",
        empty: "No data yet — log a meal to start a trend.",
        label: "Daily kcal trend",
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
      repeats: {
        title: "常吃",
        description: "近 30 天记录的餐食。点击「再记一次」即可加到今天。",
        empty: "暂无常吃 —— 多记几餐就会出现建议。",
        logAgain: "再记一次",
        logging: "记录中…",
        errorTitle: "无法记录餐食",
      },
    },
    today: {
      trendTitle: "最近 7 天",
      trendEmpty: "本周还没有记录餐食。",
      goalLineLabel: "目标",
      goalsTitle: "今日 vs 目标",
      remaining: "千卡剩余",
      over: "千卡超出",
      of: "/",
      left: "剩余",
      noTargetTitle: "尚未设定每日目标",
      noTargetBody: "设定热量和宏量目标，即可对照今天的进度。",
      setGoal: "设定目标",
      mealsTitle: "今日餐食",
      edit: "编辑",
      delete: "删除",
      confirmDelete: "删除这餐？",
      cancel: "取消",
      save: "保存",
      saving: "保存中…",
      deleting: "删除中…",
      deleteError: "无法删除该餐食。",
      saveError: "无法保存更改。",
      changeTimeHint: "按显示的时间记录——编辑餐食即可调整。",
    },
    explore: {
      title: "探索",
      description: "搜索食物、重新记录常用项并查看历史。",
      searchTitle: "搜索与重记",
      favoritesTitle: "常用",
      historyTitle: "历史与趋势",
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
        diff: {
          noChanges: "无变化",
          added: "新增",
          removed: "移除",
          unchanged: "未变",
        },
      },
    },
    dialog: {
      title: "添加食物",
      description: "手动记录一餐。记录后将添加到你的饮食日志，并更新今日营养汇总。",
      submitLabel: "添加",
      submittingLabel: "添加中…",
      cancelLabel: "取消",
      photoLabel: "照片（可选）",
      photoHint: "附上一张餐食照片 —— 餐食保存后再上传。",
      photoUploadFailed: "餐食已保存，但照片上传失败。",
      errorTitle: "无法添加食物",
      tabs: {
        manual: "手动",
        photo: "照片",
        text: "文字",
      },
      skill: {
        photoSubmitLabel: "从照片识别",
        textSubmitLabel: "解析文字",
        textPlaceholder: "例如：金枪鱼沙拉配两片面包",
        runningLabel: "正在咨询食物技能…",
        proposalTitle: "确认这餐",
        proposalDescription: "食物技能给出以下数值建议。如有不准之处请先修改，然后确认。",
        acceptLabel: "接受并保存",
        acceptingLabel: "保存中…",
        discardLabel: "放弃",
        needsEnrolment: "食物技能尚未启用。请前往「设置 → 技能」连接。",
        genericError: "食物技能无法处理此输入。",
      },
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
      controls: {
        rangeLabel: "范围",
        last7: "7 天",
        last30: "30 天",
        last90: "90 天",
        granularityLabel: "分组",
        day: "天",
        week: "周",
        month: "月",
      },
      dailyIntake: {
        title: "每日摄入",
        description: "每日热量及营养素分解，对照你的目标与平均值。",
        empty: "暂无数据 —— 记录一餐以开始摄入图表。",
        kcalLabel: "千卡",
        targetLabel: "目标",
        averageLabel: "平均",
        legend: { protein: "蛋白质", carbs: "碳水", fat: "脂肪" },
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
        avgUnit: { day: "平均热量/天", week: "平均热量/周", month: "平均热量/月" },
        loggedUnit: { day: "已记录天数", week: "已记录周数", month: "已记录月数" },
      },
      macroPie: {
        title: "营养素分布",
        description: "选定范围内蛋白质、碳水、脂肪占总热量的比例。",
        empty: "记录一餐以查看营养素分布。",
        caption: "千卡",
        legend: { protein: "蛋白质", carbs: "碳水", fat: "脂肪" },
      },
      kcalTrend: {
        title: "热量趋势",
        description: "选定范围内每日热量摄入。",
        empty: "暂无数据 —— 记录一餐以开始趋势。",
        label: "每日热量趋势",
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
      repeats: {
        title: "Comidas repetidas",
        description: "Comidas que registraste en los últimos 30 días. Pulsa «Registrar de nuevo» para añadir hoy.",
        empty: "Aún no hay comidas repetidas — registra algunas para ver sugerencias.",
        logAgain: "Registrar de nuevo",
        logging: "Registrando…",
        errorTitle: "No se pudo registrar la comida",
      },
    },
    today: {
      trendTitle: "Últimos 7 días",
      trendEmpty: "Aún no hay comidas esta semana.",
      goalLineLabel: "Objetivo",
      goalsTitle: "Hoy vs tu objetivo",
      remaining: "kcal restantes",
      over: "kcal de más",
      of: "de",
      left: "restantes",
      noTargetTitle: "Aún no hay objetivo diario",
      noTargetBody: "Fija un objetivo de calorías y macros para seguir el día con respecto a él.",
      setGoal: "Fijar objetivo",
      mealsTitle: "Comidas de hoy",
      edit: "Editar",
      delete: "Eliminar",
      confirmDelete: "¿Eliminar esta comida?",
      cancel: "Cancelar",
      save: "Guardar",
      saving: "Guardando…",
      deleting: "Eliminando…",
      deleteError: "No se pudo eliminar la comida.",
      saveError: "No se pudieron guardar los cambios.",
      changeTimeHint: "Registrada a la hora mostrada — edita la comida para ajustarla.",
    },
    explore: {
      title: "Explorar",
      description: "Busca tus alimentos, vuelve a registrar favoritos y revisa tu historial.",
      searchTitle: "Buscar y volver a registrar",
      favoritesTitle: "Favoritos",
      historyTitle: "Historial y tendencias",
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
        diff: {
          noChanges: "Sin cambios",
          added: "añadido",
          removed: "eliminado",
          unchanged: "sin cambios",
        },
      },
    },
    dialog: {
      title: "Añadir comida",
      description:
        "Registra una comida manualmente. Se añadirá a tu registro de comida y actualizará los totales nutricionales de hoy.",
      submitLabel: "Añadir",
      submittingLabel: "Añadiendo…",
      cancelLabel: "Cancelar",
      errorTitle: "No se pudo añadir la comida",
      photoLabel: "Foto (opcional)",
      photoHint: "Adjunta una imagen de la comida — se sube después de guardar.",
      photoUploadFailed: "La comida se guardó, pero falló la subida de la foto.",
      tabs: {
        manual: "Manual",
        photo: "Foto",
        text: "Texto",
      },
      skill: {
        photoSubmitLabel: "Identificar desde foto",
        textSubmitLabel: "Analizar texto",
        textPlaceholder: "p. ej. Ensalada de atún con dos tostadas",
        runningLabel: "Consultando la skill de comida…",
        proposalTitle: "Confirma esta comida",
        proposalDescription: "La skill propone estos valores. Ajusta lo que necesites y acepta.",
        acceptLabel: "Aceptar y guardar",
        acceptingLabel: "Guardando…",
        discardLabel: "Descartar",
        needsEnrolment: "La skill de comida aún no está conectada. Ve a Ajustes → Skills para activarla.",
        genericError: "La skill de comida no pudo procesar la entrada.",
      },
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
      controls: {
        rangeLabel: "Rango",
        last7: "7 días",
        last30: "30 días",
        last90: "90 días",
        granularityLabel: "Agrupar por",
        day: "Día",
        week: "Semana",
        month: "Mes",
      },
      dailyIntake: {
        title: "Consumo diario",
        description: "Calorías por día con desglose de macros, frente a tu objetivo y tu promedio.",
        empty: "Sin datos todavía — registra una comida para empezar tu gráfico de consumo.",
        kcalLabel: "kcal",
        targetLabel: "Objetivo",
        averageLabel: "Media",
        legend: { protein: "Proteína", carbs: "Carbos", fat: "Grasa" },
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
        avgUnit: { day: "Media kcal / día", week: "Media kcal / semana", month: "Media kcal / mes" },
        loggedUnit: { day: "Días registrados", week: "Semanas registradas", month: "Meses registrados" },
      },
      macroPie: {
        title: "Distribución de macros",
        description: "Proteína / carbohidratos / grasa como porcentaje de las kcal del rango seleccionado.",
        empty: "Registra una comida para ver tu distribución de macros.",
        caption: "kcal",
        legend: { protein: "Proteína", carbs: "Carbos", fat: "Grasa" },
      },
      kcalTrend: {
        title: "Tendencia de kcal",
        description: "Calorías por día en el rango seleccionado.",
        empty: "Sin datos todavía — registra una comida para empezar.",
        label: "Tendencia diaria de kcal",
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
