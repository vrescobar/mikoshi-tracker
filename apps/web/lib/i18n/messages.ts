export type SupportedLocale = "en" | "zh-CN" | "es";

export type LocaleMessages = {
  meta: {
    localeSwitchLabel: string;
  };
  auth: {
    page: {
      eyebrow: string;
      title: string;
      description: string;
      values: Array<{
        label: string;
        text: string;
      }>;
    };
    form: {
      feedback: {
        invalidTitle: string;
        invalidMessage: string;
        submitTitles: {
          signIn: string;
          signUp: string;
        };
        submitMessage: string;
        submitErrorTitle: string;
      };
      fields: {
        name: {
          label: string;
          description: string;
          required: string;
        };
        email: {
          label: string;
          description: string;
          required: string;
          invalid: string;
        };
        password: {
          label: string;
          signInDescription: string;
          signUpDescription: string;
          required: string;
          short: string;
          invalidCredentials: string;
        };
      };
      mode: {
        signIn: {
          eyebrow: string;
          description: string;
          submit: string;
          pending: string;
          switchLabel: string;
          switchAction: string;
        };
        signUp: {
          eyebrow: string;
          description: string;
          submit: string;
          pending: string;
          switchLabel: string;
          switchAction: string;
        };
      };
      disabledHint: string;
    };
  };
  shell: {
    brandCopy: string;
    navigation: {
      dashboard: string;
      entries: string;
      habits: string;
      circles: string;
      food: string;
      apiAccess: string;
      settings: string;
    };
    signOut: string;
  };
  dashboard: {
    emptyStates: {
      noEntries: {
        eyebrow: string;
        title: string;
        description: string;
        createHabit: string;
        logMeal: string;
      };
      habitsEmpty: {
        eyebrow: string;
        title: string;
        description: string;
        createHabit: string;
      };
      archivedOnly: {
        eyebrow: string;
        title: string;
        description: string;
        reviewArchived: string;
        createHabit: string;
      };
    };
    loading: {
      eyebrow: string;
      title: string;
      errorTitle: string;
      descriptionLoading: string;
      descriptionIdle: string;
      retry: string;
      routeEyebrow: string;
      routeTitle: string;
      routeDescription: string;
    };
    overview: {
      eyebrow: string;
      title: string;
      description: string;
      metrics: {
        todayCompleted: string;
        todayCompletedHint: (ratePercent: number) => string;
        thisWeek: string;
        thisWeekHint: string;
        activeHabits: string;
        activeHabitsHint: string;
      };
      trend: {
        title: string;
        subtitle: string;
      };
      ranking: {
        title: string;
        description: string;
        recentDays: (completedCount: number, totalCount: number) => string;
        currentPeriod: (completedCount: number, totalCount: number) => string;
        empty: string;
      };
      refreshing: string;
      chart: {
        notDue: string;
      };
    };
    todayUnified: {
      habitsLabel: string;
      habitsPending: (count: number) => string;
      habitsAllDone: string;
      kcalLabel: string;
      kcalProgress: (current: number, target: number) => string;
      kcalNoTarget: (current: number) => string;
    };
    foodToday: {
      eyebrow: string;
      title: string;
      description: string;
      quickAdd: string;
      target: {
        editLabel: string;
        currentLabel: (kcal: number) => string;
        emptyLabel: string;
        save: string;
        saving: string;
        cancel: string;
        placeholder: string;
        errorTitle: string;
      };
      metrics: {
        kcal: string;
        protein: string;
        carbs: string;
        fat: string;
        meals: string;
      };
      emptyState: {
        title: string;
        description: string;
      };
      viewFood: string;
    };
  };
  today: {
    hero: {
      eyebrow: string;
      title: string;
      summary: (pendingCount: number, completedCount: number) => string;
      completionRate: string;
    };
    feedback: {
      updatingTitle: string;
      updatingMessage: string;
      updatedTitle: string;
      retryTitle: string;
      updateErrorTitle: string;
    };
    states: {
      nothingDue: {
        title: string;
        description: string;
      };
      allDone: {
        title: string;
        description: string;
      };
      nothingPending: {
        title: string;
        description: string;
      };
      nothingCompleted: {
        title: string;
        description: string;
      };
    };
    groups: {
      pending: {
        title: string;
        count: (count: number) => string;
      };
      available: {
        title: string;
        count: (count: number) => string;
      };
      completed: {
        title: string;
        count: (count: number) => string;
      };
    };
    actions: {
      complete: {
        label: string;
        pendingTitle: string;
        successTitle: string;
        successMessage: string;
        cardSuccessMessage: string;
      };
      setTotal: {
        label: string;
        pendingTitle: string;
        successTitle: string;
        successMessagePending: string;
        successMessageCompleted: string;
        cardSuccessMessage: string;
      };
      undo: {
        label: string;
        pendingTitle: string;
        successTitle: string;
        successMessagePending: string;
        successMessageCompleted: string;
        cardSuccessMessage: string;
      };
    };
    item: {
      status: {
        pending: string;
        available: string;
        completed: string;
      };
      totalLabel: string;
      saveTotal: string;
      progress: {
        period: (current: number, target: number, scope: "week" | "month") => string;
        doneToday: string;
        readyToday: string;
      };
      disabledHint: string;
    };
  };
};

export const messages: Record<SupportedLocale, LocaleMessages> = {
  en: {
    meta: {
      localeSwitchLabel: "Language switch",
    },
    auth: {
      page: {
        eyebrow: "Welcome back",
        title: "Sign in to MikoshiTracker",
        description: "Sign in to continue.",
        values: [],
      },
      form: {
        feedback: {
          invalidTitle: "Check these details",
          invalidMessage: "Fix the highlighted fields and try again.",
          submitTitles: {
            signIn: "Signing you in",
            signUp: "Creating your account",
          },
          submitMessage: "This form stays locked until the current request finishes.",
          submitErrorTitle: "Unable to continue",
        },
        fields: {
          name: {
            label: "Name",
            description: "Use a name you will recognize when you come back to this deployment.",
            required: "Add a name for this local account.",
          },
          email: {
            label: "Email",
            description: "Use the email you want tied to this self-hosted account.",
            required: "Enter the email tied to this deployment.",
            invalid: "Enter a valid email address.",
          },
          password: {
            label: "Password",
            signInDescription: "Use the password already stored on this deployment.",
            signUpDescription: "Use at least 8 characters.",
            required: "Enter your password to continue.",
            short: "Use at least 8 characters.",
            invalidCredentials: "Check your email and password, then try again.",
          },
        },
        mode: {
          signIn: {
            eyebrow: "Sign in",
            description: "Use your account to continue.",
            submit: "Sign in",
            pending: "Signing in...",
            switchLabel: "Need a new account?",
            switchAction: "Create account",
          },
          signUp: {
            eyebrow: "Create a local account",
            description:
              "This account lives on the deployment you control, so you can sign in later without leaving your self-hosted workflow.",
            submit: "Create account",
            pending: "Creating account...",
            switchLabel: "Already have an account?",
            switchAction: "Back to sign in",
          },
        },
        disabledHint: "The primary action will unlock as soon as this request settles.",
      },
    },
    shell: {
      brandCopy: "Calm daily execution with a stable AI-ready habit system.",
      navigation: {
        dashboard: "Today",
        entries: "Entries",
        habits: "Habits",
        circles: "Circles",
        food: "Food",
        apiAccess: "API Access",
        settings: "Settings",
      },
      signOut: "Log out",
    },
    dashboard: {
      emptyStates: {
        noEntries: {
          eyebrow: "Today",
          title: "Nothing tracked yet",
          description:
            "Start by creating your first habit, or log a meal — both live side by side on this dashboard.",
          createHabit: "Create first habit",
          logMeal: "Log a meal",
        },
        habitsEmpty: {
          eyebrow: "Today",
          title: "No active habits right now",
          description:
            "Food tracking is on. Create a habit to round out your daily loop, or keep logging meals.",
          createHabit: "Create first habit",
        },
        archivedOnly: {
          eyebrow: "Today",
          title: "No active habits right now",
          description:
            "Your archived habits are preserved. Restore one or create a new habit to bring today back online.",
          reviewArchived: "Review archived habits",
          createHabit: "Create a new habit",
        },
      },
      loading: {
        eyebrow: "Dashboard",
        title: "Preparing dashboard",
        errorTitle: "Dashboard needs another try",
        descriptionLoading: "Loading today data and overview metrics inside the protected shell.",
        descriptionIdle: "Dashboard data is still warming up.",
        retry: "Retry dashboard",
        routeEyebrow: "Dashboard",
        routeTitle: "Preparing dashboard",
        routeDescription: "Analytics and today data are loading without dropping you out of the protected shell.",
      },
      overview: {
        eyebrow: "Supporting overview",
        title: "Overview",
        description: "Supporting account trends and stability after you have scanned today's work.",
        metrics: {
          todayCompleted: "Completed today",
          todayCompletedHint: (ratePercent) => `${ratePercent}% of due habits`,
          thisWeek: "This week",
          thisWeekHint: "Natural calendar week",
          activeHabits: "Active habits",
          activeHabitsHint: "Current working set",
        },
        trend: {
          title: "7-day completion rate",
          subtitle: "Daily account trend for the current week",
        },
        ranking: {
          title: "Stability ranking",
          description: "Daily habits use recent completion rate. Count-based habits use current period progress.",
          recentDays: (completedCount, totalCount) => `${completedCount}/${totalCount} recent due days`,
          currentPeriod: (completedCount, totalCount) => `${completedCount}/${totalCount} in the current target`,
          empty: "No active habits with recent due history yet.",
        },
        refreshing: "Refreshing overview...",
        chart: {
          notDue: "Not due",
        },
      },
      todayUnified: {
        habitsLabel: "Habits",
        habitsPending: (count) => `${count} pending`,
        habitsAllDone: "All done",
        kcalLabel: "Kcal",
        kcalProgress: (current, target) => `${current} / ${target}`,
        kcalNoTarget: (current) => `${current}`,
      },
      foodToday: {
        eyebrow: "Nutrition",
        title: "Food today",
        description: "Calories and macros logged so far today.",
        quickAdd: "Log a meal",
        target: {
          editLabel: "Edit target",
          currentLabel: (kcal) => `Daily target: ${kcal} kcal`,
          emptyLabel: "No daily target set.",
          save: "Save",
          saving: "Saving…",
          cancel: "Cancel",
          placeholder: "Daily kcal target",
          errorTitle: "Could not save target",
        },
        metrics: {
          kcal: "kcal",
          protein: "Protein",
          carbs: "Carbs",
          fat: "Fat",
          meals: "Meals",
        },
        emptyState: {
          title: "Nothing logged yet",
          description: "Log meals via WhatsApp to see them here.",
        },
        viewFood: "View food log →",
      },
    },
    today: {
      hero: {
        eyebrow: "Daily focus",
        title: "Today",
        summary: (pendingCount, completedCount) => `${pendingCount} pending · ${completedCount} completed`,
        completionRate: "Completion rate",
      },
      feedback: {
        updatingTitle: "Updating today",
        updatingMessage: "Your lists and summary will stay in sync when this update settles.",
        updatedTitle: "Today updated",
        retryTitle: "Today needs another try",
        updateErrorTitle: "Unable to update today",
      },
      states: {
        nothingDue: {
          title: "Nothing due today",
          description:
            "Today's list is clear for now. Future or off-cycle habits will show up here when they become actionable.",
        },
        allDone: {
          title: "All done for today",
          description:
            "Everything due today is already complete. Finished habits stay visible below in case you need to review or undo.",
        },
        nothingPending: {
          title: "Nothing pending right now",
          description: "New or incomplete habits will stay here until you finish them.",
        },
        nothingCompleted: {
          title: "Nothing completed yet",
          description:
            "Finished habits stay visible so you can undo or inspect today's result without leaving context.",
        },
      },
      groups: {
        pending: {
          title: "Pending",
          count: (count) => `${count} pending`,
        },
        available: {
          title: "Available",
          count: (count) => `${count} available`,
        },
        completed: {
          title: "Completed",
          count: (count) => `${count} completed`,
        },
      },
      actions: {
        complete: {
          label: "Complete",
          pendingTitle: "Marking habit complete",
          successTitle: "Habit updated",
          successMessage: "The pending list and completion totals are now in sync.",
          cardSuccessMessage: "Marked complete. You can undo from this card if needed.",
        },
        setTotal: {
          label: "Add amount",
          pendingTitle: "Adding to today's progress",
          successTitle: "Progress updated",
          successMessagePending: "The new amount now counts toward today's completion status.",
          successMessageCompleted: "The completed list now reflects the added amount.",
          cardSuccessMessage: "Added to today's progress.",
        },
        undo: {
          label: "Undo",
          pendingTitle: "Reverting latest update",
          successTitle: "Update reverted",
          successMessagePending: "Today's totals now reflect the previous saved value.",
          successMessageCompleted: "This habit has moved back to the appropriate today state.",
          cardSuccessMessage: "Reverted to the previous saved value.",
        },
      },
      item: {
        status: {
          pending: "pending",
          available: "available",
          completed: "completed",
        },
        totalLabel: "Today's amount",
        saveTotal: "Add amount",
        progress: {
          period: (current, target, scope) => `${current} / ${target} this ${scope}`,
          doneToday: "Done today",
          readyToday: "Ready for today",
        },
        disabledHint: "Controls will unlock when this habit finishes syncing with today.",
      },
    },
  },
  "zh-CN": {
    meta: {
      localeSwitchLabel: "语言切换",
    },
    auth: {
      page: {
        eyebrow: "欢迎回来",
        title: "登录 MikoshiTracker",
        description: "登录后继续使用。",
        values: [],
      },
      form: {
        feedback: {
          invalidTitle: "请检查这些信息",
          invalidMessage: "修正高亮字段后再试一次。",
          submitTitles: {
            signIn: "正在为你登录",
            signUp: "正在创建账户",
          },
          submitMessage: "当前请求完成前，表单会暂时锁定。",
          submitErrorTitle: "暂时无法继续",
        },
        fields: {
          name: {
            label: "名称",
            description: "使用一个下次回到这套部署时你仍能识别的名字。",
            required: "请为这个本地账户填写名称。",
          },
          email: {
            label: "邮箱",
            description: "使用你希望绑定到这套自托管账户的邮箱。",
            required: "请输入这套部署对应的邮箱。",
            invalid: "请输入有效的邮箱地址。",
          },
          password: {
            label: "密码",
            signInDescription: "使用这套部署里已经保存的密码。",
            signUpDescription: "请至少使用 8 个字符。",
            required: "请输入密码后继续。",
            short: "请至少使用 8 个字符。",
            invalidCredentials: "请检查邮箱和密码后再试一次。",
          },
        },
        mode: {
          signIn: {
            eyebrow: "登录",
            description: "使用你的账户继续。",
            submit: "登录",
            pending: "登录中...",
            switchLabel: "还没有账户？",
            switchAction: "创建账户",
          },
          signUp: {
            eyebrow: "创建本地账户",
            description: "这个账户只存在于你控制的部署中，之后你可以在同一套自托管流程里继续登录使用。",
            submit: "创建账户",
            pending: "创建中...",
            switchLabel: "已经有账户了？",
            switchAction: "返回登录",
          },
        },
        disabledHint: "当前请求完成后，主操作会立即恢复可用。",
      },
    },
    shell: {
      brandCopy: "平静完成每天该做的事，同时保持一套稳定、可供 AI 读取的习惯系统。",
      navigation: {
        dashboard: "今天",
        entries: "条目",
        habits: "习惯",
        circles: "圈子",
        food: "饮食",
        apiAccess: "API 访问",
        settings: "设置",
      },
      signOut: "退出登录",
    },
    dashboard: {
      emptyStates: {
        noEntries: {
          eyebrow: "今天",
          title: "还没有任何记录",
          description: "先创建一个习惯，或记录一餐 —— 两者都会出现在这个页面。",
          createHabit: "创建第一个习惯",
          logMeal: "记录一餐",
        },
        habitsEmpty: {
          eyebrow: "今天",
          title: "当前没有启用中的习惯",
          description: "饮食记录已就绪。创建一个习惯让你的日常更完整，或继续记录餐食。",
          createHabit: "创建第一个习惯",
        },
        archivedOnly: {
          eyebrow: "今天",
          title: "当前没有启用中的习惯",
          description: "已归档的习惯仍然保留着。恢复一个，或者新建一个习惯，就能让今天重新开始运转。",
          reviewArchived: "查看已归档习惯",
          createHabit: "创建新习惯",
        },
      },
      loading: {
        eyebrow: "仪表盘",
        title: "正在准备仪表盘",
        errorTitle: "仪表盘需要再试一次",
        descriptionLoading: "正在受保护区域内加载 today 数据和概览指标。",
        descriptionIdle: "仪表盘数据仍在预热。",
        retry: "重试仪表盘",
        routeEyebrow: "仪表盘",
        routeTitle: "正在准备仪表盘",
        routeDescription: "分析数据和 today 内容正在加载，但不会把你带离当前受保护区域。",
      },
      overview: {
        eyebrow: "辅助概览",
        title: "概览",
        description: "先看完今天要做的事，再用这些账户级趋势和稳定性信息做辅助判断。",
        metrics: {
          todayCompleted: "今日已完成",
          todayCompletedHint: (ratePercent) => `占今日应完成习惯的 ${ratePercent}%`,
          thisWeek: "本周完成率",
          thisWeekHint: "按自然周统计",
          activeHabits: "启用中的习惯",
          activeHabitsHint: "当前工作集合",
        },
        trend: {
          title: "近 7 天完成率",
          subtitle: "按天展示最近一周的账户趋势",
        },
        ranking: {
          title: "稳定度排序",
          description: "按近期完成率或当前周期进度对启用中的习惯排序。",
          recentDays: (completedCount, totalCount) => `最近应完成日 ${completedCount}/${totalCount}`,
          currentPeriod: (completedCount, totalCount) => `当前周期 ${completedCount}/${totalCount}`,
          empty: "目前还没有带近期应完成记录的启用中习惯。",
        },
        refreshing: "正在刷新概览...",
        chart: {
          notDue: "当天无任务",
        },
      },
      todayUnified: {
        habitsLabel: "习惯",
        habitsPending: (count) => `${count} 个待完成`,
        habitsAllDone: "已全部完成",
        kcalLabel: "热量",
        kcalProgress: (current, target) => `${current} / ${target}`,
        kcalNoTarget: (current) => `${current}`,
      },
      foodToday: {
        eyebrow: "营养",
        title: "今日饮食",
        description: "今天已记录的热量和营养素。",
        quickAdd: "记录一餐",
        target: {
          editLabel: "编辑目标",
          currentLabel: (kcal) => `每日目标：${kcal} 千卡`,
          emptyLabel: "未设置每日目标。",
          save: "保存",
          saving: "保存中…",
          cancel: "取消",
          placeholder: "每日千卡目标",
          errorTitle: "无法保存目标",
        },
        metrics: {
          kcal: "千卡",
          protein: "蛋白质",
          carbs: "碳水",
          fat: "脂肪",
          meals: "餐数",
        },
        emptyState: {
          title: "今天还没有记录",
          description: "通过 WhatsApp 记录饮食，它们会显示在这里。",
        },
        viewFood: "查看饮食记录 →",
      },
    },
    today: {
      hero: {
        eyebrow: "今日重点",
        title: "今天",
        summary: (pendingCount, completedCount) => `${pendingCount} 个待完成 · ${completedCount} 个已完成`,
        completionRate: "完成率",
      },
      feedback: {
        updatingTitle: "正在更新今天",
        updatingMessage: "这次更新完成后，列表和汇总会保持同步。",
        updatedTitle: "今天已更新",
        retryTitle: "今天需要再试一次",
        updateErrorTitle: "暂时无法更新今天",
      },
      states: {
        nothingDue: {
          title: "今天没有到期事项",
          description: "当前今天列表是空的。等未来开始或进入周期的习惯出现后，它们会显示在这里。",
        },
        allDone: {
          title: "今天已全部完成",
          description: "今天应做的内容都已经完成。已完成的习惯会继续留在下方，方便你回看或撤销。",
        },
        nothingPending: {
          title: "当前没有待完成事项",
          description: "新的或尚未完成的习惯会一直留在这里，直到你处理完。",
        },
        nothingCompleted: {
          title: "还没有已完成事项",
          description: "已完成的习惯会继续显示在这里，方便你不离开当前上下文就能查看或撤销。",
        },
      },
      groups: {
        pending: {
          title: "待完成",
          count: (count) => `${count} 个待完成`,
        },
        available: {
          title: "可完成",
          count: (count) => `${count} 个可完成`,
        },
        completed: {
          title: "已完成",
          count: (count) => `${count} 个已完成`,
        },
      },
      actions: {
        complete: {
          label: "完成",
          pendingTitle: "正在标记完成",
          successTitle: "习惯已更新",
          successMessage: "待完成列表和完成汇总现在已经同步。",
          cardSuccessMessage: "已标记完成。如有需要，你可以直接在这张卡片里撤销。",
        },
        setTotal: {
          label: "添加数量",
          pendingTitle: "正在添加今天的进度",
          successTitle: "进度已更新",
          successMessagePending: "新增的数量现在会计入今天的完成状态。",
          successMessageCompleted: "已完成列表现在反映的是新增后的数量。",
          cardSuccessMessage: "已添加到今天进度中。",
        },
        undo: {
          label: "撤销",
          pendingTitle: "正在撤销刚才的更新",
          successTitle: "已撤销更新",
          successMessagePending: "今天的汇总现在反映的是上一次保存的值。",
          successMessageCompleted: "这个习惯已经回到它当前应在的 today 状态。",
          cardSuccessMessage: "已恢复到上一次保存的值。",
        },
      },
      item: {
        status: {
          pending: "待完成",
          available: "可完成",
          completed: "已完成",
        },
        totalLabel: "今天新增",
        saveTotal: "添加数量",
        progress: {
          period: (current, target, scope) => `${scope === "week" ? "本周" : "本月"} ${current} / ${target}`,
          doneToday: "今天已完成",
          readyToday: "今天待处理",
        },
        disabledHint: "等这个习惯和今天的数据同步完成后，控件就会恢复可用。",
      },
    },
  },
  es: {
    meta: {
      localeSwitchLabel: "Cambiar idioma",
    },
    auth: {
      page: {
        eyebrow: "Bienvenido de nuevo",
        title: "Inicia sesión en MikoshiTracker",
        description: "Inicia sesión para continuar.",
        values: [],
      },
      form: {
        feedback: {
          invalidTitle: "Revisa estos campos",
          invalidMessage: "Corrige los campos marcados e inténtalo de nuevo.",
          submitTitles: {
            signIn: "Iniciando sesión",
            signUp: "Creando tu cuenta",
          },
          submitMessage: "El formulario permanece bloqueado hasta que termine la solicitud actual.",
          submitErrorTitle: "No se puede continuar",
        },
        fields: {
          name: {
            label: "Nombre",
            description: "Usa un nombre que puedas reconocer cuando vuelvas a este despliegue.",
            required: "Añade un nombre para esta cuenta local.",
          },
          email: {
            label: "Correo electrónico",
            description: "Usa el correo que quieres vincular a esta cuenta autoalojada.",
            required: "Introduce el correo vinculado a este despliegue.",
            invalid: "Introduce una dirección de correo válida.",
          },
          password: {
            label: "Contraseña",
            signInDescription: "Usa la contraseña ya guardada en este despliegue.",
            signUpDescription: "Usa al menos 8 caracteres.",
            required: "Introduce tu contraseña para continuar.",
            short: "Usa al menos 8 caracteres.",
            invalidCredentials: "Revisa tu correo y contraseña, luego inténtalo de nuevo.",
          },
        },
        mode: {
          signIn: {
            eyebrow: "Iniciar sesión",
            description: "Usa tu cuenta para continuar.",
            submit: "Iniciar sesión",
            pending: "Iniciando sesión...",
            switchLabel: "¿Necesitas una cuenta nueva?",
            switchAction: "Crear cuenta",
          },
          signUp: {
            eyebrow: "Crear cuenta local",
            description:
              "Esta cuenta reside en el despliegue que controlas, así que podrás iniciar sesión más adelante sin salir de tu flujo autoalojado.",
            submit: "Crear cuenta",
            pending: "Creando cuenta...",
            switchLabel: "¿Ya tienes una cuenta?",
            switchAction: "Volver a iniciar sesión",
          },
        },
        disabledHint: "La acción principal se desbloqueará en cuanto se complete esta solicitud.",
      },
    },
    shell: {
      brandCopy: "Ejecución diaria tranquila con un sistema de hábitos estable y preparado para IA.",
      navigation: {
        dashboard: "Hoy",
        entries: "Entradas",
        habits: "Hábitos",
        circles: "Círculos",
        food: "Comida",
        apiAccess: "Acceso API",
        settings: "Ajustes",
      },
      signOut: "Cerrar sesión",
    },
    dashboard: {
      emptyStates: {
        noEntries: {
          eyebrow: "Hoy",
          title: "Aún no registras nada",
          description:
            "Empieza creando tu primer hábito o registra una comida — los dos viven en este panel.",
          createHabit: "Crear primer hábito",
          logMeal: "Registrar comida",
        },
        habitsEmpty: {
          eyebrow: "Hoy",
          title: "No hay hábitos activos ahora mismo",
          description:
            "Tu registro de comida sigue activo. Crea un hábito para completar tu rutina diaria o sigue registrando comidas.",
          createHabit: "Crear primer hábito",
        },
        archivedOnly: {
          eyebrow: "Hoy",
          title: "No hay hábitos activos ahora mismo",
          description:
            "Tus hábitos archivados están conservados. Restaura uno o crea un hábito nuevo para volver a tener actividad hoy.",
          reviewArchived: "Revisar hábitos archivados",
          createHabit: "Crear un nuevo hábito",
        },
      },
      loading: {
        eyebrow: "Panel",
        title: "Preparando el panel",
        errorTitle: "El panel necesita otro intento",
        descriptionLoading: "Cargando los datos de hoy y las métricas de resumen dentro del entorno protegido.",
        descriptionIdle: "Los datos del panel aún se están preparando.",
        retry: "Reintentar panel",
        routeEyebrow: "Panel",
        routeTitle: "Preparando el panel",
        routeDescription: "Los análisis y los datos de hoy se están cargando sin sacarte del entorno protegido.",
      },
      overview: {
        eyebrow: "Resumen de apoyo",
        title: "Resumen",
        description: "Tendencias y estabilidad de la cuenta de apoyo, después de revisar el trabajo de hoy.",
        metrics: {
          todayCompleted: "Completados hoy",
          todayCompletedHint: (ratePercent) => `${ratePercent}% de los hábitos previstos`,
          thisWeek: "Esta semana",
          thisWeekHint: "Semana natural del calendario",
          activeHabits: "Hábitos activos",
          activeHabitsHint: "Conjunto de trabajo actual",
        },
        trend: {
          title: "Tasa de compleción de 7 días",
          subtitle: "Tendencia diaria de la cuenta para la semana actual",
        },
        ranking: {
          title: "Clasificación de estabilidad",
          description:
            "Los hábitos diarios usan la tasa de compleción reciente. Los hábitos por cantidad usan el progreso del período actual.",
          recentDays: (completedCount, totalCount) => `${completedCount}/${totalCount} días recientes previstos`,
          currentPeriod: (completedCount, totalCount) => `${completedCount}/${totalCount} en el objetivo actual`,
          empty: "Aún no hay hábitos activos con historial reciente de previsiones.",
        },
        refreshing: "Actualizando resumen...",
        chart: {
          notDue: "Sin previsión",
        },
      },
      todayUnified: {
        habitsLabel: "Hábitos",
        habitsPending: (count) => `${count} pendiente${count === 1 ? "" : "s"}`,
        habitsAllDone: "Todo hecho",
        kcalLabel: "Kcal",
        kcalProgress: (current, target) => `${current} / ${target}`,
        kcalNoTarget: (current) => `${current}`,
      },
      foodToday: {
        eyebrow: "Nutrición",
        title: "Hoy en comida",
        description: "Calorías y macros registrados hasta ahora hoy.",
        quickAdd: "Registrar comida",
        target: {
          editLabel: "Editar objetivo",
          currentLabel: (kcal) => `Objetivo diario: ${kcal} kcal`,
          emptyLabel: "Sin objetivo diario.",
          save: "Guardar",
          saving: "Guardando…",
          cancel: "Cancelar",
          placeholder: "Objetivo de kcal diario",
          errorTitle: "No se pudo guardar el objetivo",
        },
        metrics: {
          kcal: "kcal",
          protein: "Proteína",
          carbs: "Carbohidratos",
          fat: "Grasa",
          meals: "Comidas",
        },
        emptyState: {
          title: "Nada registrado aún",
          description: "Registra comidas vía WhatsApp para verlas aquí.",
        },
        viewFood: "Ver registro de comida →",
      },
    },
    today: {
      hero: {
        eyebrow: "Enfoque diario",
        title: "Hoy",
        summary: (pendingCount, completedCount) => `${pendingCount} pendientes · ${completedCount} completados`,
        completionRate: "Tasa de compleción",
      },
      feedback: {
        updatingTitle: "Actualizando hoy",
        updatingMessage: "Tus listas y el resumen se sincronizarán cuando se complete esta actualización.",
        updatedTitle: "Hoy actualizado",
        retryTitle: "Hoy necesita otro intento",
        updateErrorTitle: "No se puede actualizar hoy",
      },
      states: {
        nothingDue: {
          title: "Nada previsto para hoy",
          description:
            "La lista de hoy está vacía por ahora. Los hábitos futuros o fuera de ciclo aparecerán aquí cuando sean accionables.",
        },
        allDone: {
          title: "Todo listo por hoy",
          description:
            "Todo lo previsto para hoy ya está completado. Los hábitos terminados permanecen visibles abajo por si necesitas revisar o deshacer.",
        },
        nothingPending: {
          title: "Nada pendiente ahora mismo",
          description: "Los hábitos nuevos o incompletos permanecerán aquí hasta que los termines.",
        },
        nothingCompleted: {
          title: "Nada completado aún",
          description:
            "Los hábitos terminados permanecen visibles para que puedas deshacer o revisar el resultado de hoy sin perder contexto.",
        },
      },
      groups: {
        pending: {
          title: "Pendientes",
          count: (count) => `${count} pendientes`,
        },
        available: {
          title: "Disponibles",
          count: (count) => `${count} disponibles`,
        },
        completed: {
          title: "Completados",
          count: (count) => `${count} completados`,
        },
      },
      actions: {
        complete: {
          label: "Completar",
          pendingTitle: "Marcando hábito como completado",
          successTitle: "Hábito actualizado",
          successMessage: "La lista de pendientes y los totales de compleción están ahora sincronizados.",
          cardSuccessMessage: "Marcado como completado. Puedes deshacer desde esta tarjeta si es necesario.",
        },
        setTotal: {
          label: "Añadir cantidad",
          pendingTitle: "Añadiendo al progreso de hoy",
          successTitle: "Progreso actualizado",
          successMessagePending: "La nueva cantidad ahora cuenta hacia el estado de compleción de hoy.",
          successMessageCompleted: "La lista de completados ahora refleja la cantidad añadida.",
          cardSuccessMessage: "Añadido al progreso de hoy.",
        },
        undo: {
          label: "Deshacer",
          pendingTitle: "Revirtiendo la última actualización",
          successTitle: "Actualización revertida",
          successMessagePending: "Los totales de hoy ahora reflejan el valor guardado anteriormente.",
          successMessageCompleted: "Este hábito ha vuelto al estado de hoy apropiado.",
          cardSuccessMessage: "Revertido al valor guardado anteriormente.",
        },
      },
      item: {
        status: {
          pending: "pendiente",
          available: "disponible",
          completed: "completado",
        },
        totalLabel: "Cantidad de hoy",
        saveTotal: "Añadir cantidad",
        progress: {
          period: (current, target, scope) => `${current} / ${target} ${scope === "week" ? "esta semana" : "este mes"}`,
          doneToday: "Hecho hoy",
          readyToday: "Listo para hoy",
        },
        disabledHint: "Los controles se desbloquearán cuando este hábito termine de sincronizarse con hoy.",
      },
    },
  },
};
