import type { SupportedLocale } from "./messages";

export type SettingsCopy = {
  index: {
    eyebrow: string;
    title: string;
    description: string;
    skillsCard: { title: string; description: string; cta: string };
    apiAccessCard: { title: string; description: string; cta: string };
  };
  skills: {
    eyebrow: string;
    title: string;
    description: string;
    empty: string;
    statusEnrolled: string;
    statusNotEnrolled: string;
    statusUnreachable: string;
    lastRunLabel: string;
    lastRunNever: string;
    lastErrorLabel: string;
    backLink: string;
  };
};

const settingsCopy: Record<SupportedLocale, SettingsCopy> = {
  en: {
    index: {
      eyebrow: "Settings",
      title: "Settings",
      description: "Connect skills, manage API access, and tune your tracker.",
      skillsCard: {
        title: "Skills",
        description: "Inspect the health of Mikoshi skills that power AI ingestion.",
        cta: "Open skills",
      },
      apiAccessCard: {
        title: "API access",
        description: "Manage the personal token that lets agents talk to your tracker.",
        cta: "Open API access",
      },
    },
    skills: {
      eyebrow: "Settings",
      title: "Skills",
      description:
        "Read-only view of every EntryType that has a skill attached. Configure skill secrets in Mikoshi.",
      empty: "No skills are registered against any EntryType yet.",
      statusEnrolled: "Enrolled",
      statusNotEnrolled: "Not enrolled",
      statusUnreachable: "Runner unreachable",
      lastRunLabel: "Last run",
      lastRunNever: "Never",
      lastErrorLabel: "Last error",
      backLink: "← Back to settings",
    },
  },
  "zh-CN": {
    index: {
      eyebrow: "设置",
      title: "设置",
      description: "连接技能、管理 API 访问、调整你的追踪器。",
      skillsCard: {
        title: "技能",
        description: "查看驱动 AI 录入的 Mikoshi 技能的健康状态。",
        cta: "打开技能",
      },
      apiAccessCard: {
        title: "API 访问",
        description: "管理供代理访问追踪器的个人令牌。",
        cta: "打开 API 访问",
      },
    },
    skills: {
      eyebrow: "设置",
      title: "技能",
      description: "所有附带技能的 EntryType 的只读视图。技能密钥在 Mikoshi 中配置。",
      empty: "尚未在任何 EntryType 上注册技能。",
      statusEnrolled: "已启用",
      statusNotEnrolled: "未启用",
      statusUnreachable: "运行器不可达",
      lastRunLabel: "最近运行",
      lastRunNever: "从未",
      lastErrorLabel: "最近错误",
      backLink: "← 返回设置",
    },
  },
  es: {
    index: {
      eyebrow: "Ajustes",
      title: "Ajustes",
      description: "Conecta skills, gestiona el acceso API y ajusta tu tracker.",
      skillsCard: {
        title: "Skills",
        description: "Revisa el estado de las skills de Mikoshi que alimentan la ingesta con IA.",
        cta: "Abrir skills",
      },
      apiAccessCard: {
        title: "Acceso API",
        description: "Gestiona el token personal con el que tus agentes hablan con tu tracker.",
        cta: "Abrir acceso API",
      },
    },
    skills: {
      eyebrow: "Ajustes",
      title: "Skills",
      description:
        "Vista de solo lectura de cada EntryType con skill. Configura los secretos en Mikoshi.",
      empty: "Aún no hay skills registradas en ningún EntryType.",
      statusEnrolled: "Activado",
      statusNotEnrolled: "No activado",
      statusUnreachable: "Runner inaccesible",
      lastRunLabel: "Última ejecución",
      lastRunNever: "Nunca",
      lastErrorLabel: "Último error",
      backLink: "← Volver a ajustes",
    },
  },
};

export function getSettingsCopy(locale: SupportedLocale): SettingsCopy {
  return settingsCopy[locale];
}
