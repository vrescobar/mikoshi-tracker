import type { SupportedLocale } from "./messages";

export type ApiAccessCopy = {
  feedback: {
    rotatePendingTitle: (hasToken: boolean) => string;
    refreshPendingTitle: string;
    pendingMessage: string;
    rotateSuccessTitle: (hasToken: boolean) => string;
    rotateSuccessMessage: string;
    updateErrorTitle: string;
    copySuccessTitle: string;
    copySuccessMessage: string;
    copyErrorTitle: string;
  };
  page: {
    eyebrow: string;
    title: string;
    description: string;
    tokenLabel: string;
    tokenDescriptions: {
      empty: string;
      fresh: string;
      stored: string;
    };
    guidanceTitle: string;
    guidanceLines: string[];
    storedStateTitle: string;
    storedStateDescription: string;
    storedTokenValue: string;
    lastRotatedLabel: string;
    emptyStateTitle: string;
    emptyStateDescription: string;
    actions: {
      generate: string;
      rotate: string;
      reveal: string;
      hide: string;
      copy: string;
    };
    rotateConfirm: string;
    disabledHint: string;
    quickstart: {
      eyebrow: string;
      title: string;
      description: string;
      docsLink: string;
      specLink: string;
    };
    registration: {
      eyebrow: string;
      title: string;
      description: string;
      enabled: string;
      disabled: string;
      enableAction: string;
      disableAction: string;
      pendingHint: string;
    };
  };
};

const apiAccessCopy: Record<SupportedLocale, ApiAccessCopy> = {
  en: {
    feedback: {
      rotatePendingTitle: (hasToken) => (hasToken ? "Rotating token" : "Generating token"),
      refreshPendingTitle: "Refreshing token",
      pendingMessage: "Token controls stay locked until the current request finishes.",
      rotateSuccessTitle: (hasToken) => (hasToken ? "Token rotated" : "Token generated"),
      rotateSuccessMessage: "Store this bearer token now. Replacing it invalidates the previous value immediately.",
      updateErrorTitle: "Unable to update API access",
      copySuccessTitle: "Token copied",
      copySuccessMessage: "The token is in your clipboard. Paste it only into a trusted client or secret store.",
      copyErrorTitle: "Unable to copy token",
    },
    page: {
      eyebrow: "AI integration",
      title: "API access",
      description: "Manage the personal bearer token your scripts and assistants should use when calling MikoshiTracker.",
      tokenLabel: "Personal API token",
      tokenDescriptions: {
        empty: "Generate a token before trying bearer-authenticated API calls.",
        fresh: "Hidden by default. Reveal it only when you need to copy it into a trusted client right now.",
        stored: "This token is already stored securely. Rotate it to get a new raw value you can copy.",
      },
      guidanceTitle: "Treat this token like a password.",
      guidanceLines: [
        "Store it in a trusted secret store or private environment file.",
        "Rotation invalidates the previous token immediately.",
      ],
      storedStateTitle: "Token already stored securely",
      storedStateDescription: "Raw token values are shown only once, right after generation or rotation.",
      storedTokenValue: "Stored securely - rotate to reveal a new token",
      lastRotatedLabel: "Last rotated",
      emptyStateTitle: "No personal API token yet",
      emptyStateDescription: "No personal API token has been generated yet.",
      actions: {
        generate: "Generate token",
        rotate: "Rotate token",
        reveal: "Reveal token",
        hide: "Hide token",
        copy: "Copy token",
      },
      rotateConfirm: "Rotating this token invalidates the previous value immediately. Continue?",
      disabledHint: "Token controls unlock after the current request settles.",
      quickstart: {
        eyebrow: "Quickstart",
        title: "First call",
        description: "Start with the bearer header, then verify the connection against today's summary endpoint.",
        docsLink: "Open API docs",
        specLink: "OpenAPI JSON",
      },
      registration: {
        eyebrow: "Admin",
        title: "Registration access",
        description: "Control whether new users can create local accounts from the sign-in page.",
        enabled: "Registration is open",
        disabled: "Registration is closed",
        enableAction: "Reopen registration",
        disableAction: "Close registration",
        pendingHint: "Registration controls unlock after the current request settles.",
      },
    },
  },
  "zh-CN": {
    feedback: {
      rotatePendingTitle: (hasToken) => (hasToken ? "正在轮换 token" : "正在生成 token"),
      refreshPendingTitle: "正在刷新 token",
      pendingMessage: "当前请求完成前，token 控件会暂时锁定。",
      rotateSuccessTitle: (hasToken) => (hasToken ? "token 已轮换" : "token 已生成"),
      rotateSuccessMessage: "请现在就妥善保存这个 bearer token。替换后，旧值会立即失效。",
      updateErrorTitle: "暂时无法更新 API 访问",
      copySuccessTitle: "token 已复制",
      copySuccessMessage: "token 已进入剪贴板。请只把它粘贴到可信客户端或私密凭据存储里。",
      copyErrorTitle: "暂时无法复制 token",
    },
    page: {
      eyebrow: "AI 集成",
      title: "API 访问",
      description: "管理脚本和助手在调用 MikoshiTracker 时应使用的个人 bearer token。",
      tokenLabel: "个人 API token",
      tokenDescriptions: {
        empty: "先生成 token，再去发起 bearer 鉴权的 API 调用。",
        fresh: "默认隐藏。只有在你需要立刻复制到可信客户端时才显示它。",
        stored: "这个 token 已安全存储。若要重新拿到原始值，请轮换生成新的 token。",
      },
      guidanceTitle: "请像保管密码一样保管这个 token。",
      guidanceLines: ["把它存进可信的密钥管理工具或私有环境变量文件。", "轮换后，旧 token 会立即失效。"],
      storedStateTitle: "token 已安全保存",
      storedStateDescription: "原始 token 只会在生成或轮换后显示一次。",
      storedTokenValue: "已安全保存，如需原始值请轮换新的 token",
      lastRotatedLabel: "上次轮换",
      emptyStateTitle: "还没有个人 API token",
      emptyStateDescription: "当前还没有生成个人 API token。",
      actions: {
        generate: "生成 token",
        rotate: "轮换 token",
        reveal: "显示 token",
        hide: "隐藏 token",
        copy: "复制 token",
      },
      rotateConfirm: "轮换后，旧 token 会立即失效。确定继续吗？",
      disabledHint: "当前请求完成后，token 控件会恢复可用。",
      quickstart: {
        eyebrow: "快速开始",
        title: "第一条调用",
        description: "先带上 bearer header，再用 today summary 接口验证连接是否正常。",
        docsLink: "打开 API 文档",
        specLink: "OpenAPI JSON",
      },
      registration: {
        eyebrow: "管理员",
        title: "注册权限",
        description: "控制登录页是否允许新用户继续创建本地账户。",
        enabled: "当前允许注册",
        disabled: "当前已关闭注册",
        enableAction: "重新开启注册",
        disableAction: "关闭注册",
        pendingHint: "当前请求完成后，注册权限控件会恢复可用。",
      },
    },
  },
  es: {
    feedback: {
      rotatePendingTitle: (hasToken) => (hasToken ? "Rotando token" : "Generando token"),
      refreshPendingTitle: "Actualizando token",
      pendingMessage: "Los controles del token permanecen bloqueados hasta que termine la solicitud actual.",
      rotateSuccessTitle: (hasToken) => (hasToken ? "Token rotado" : "Token generado"),
      rotateSuccessMessage:
        "Guarda este token de portador ahora. Reemplazarlo invalida el valor anterior de inmediato.",
      updateErrorTitle: "No se puede actualizar el acceso API",
      copySuccessTitle: "Token copiado",
      copySuccessMessage:
        "El token está en tu portapapeles. Pégalo solo en un cliente de confianza o almacén de secretos.",
      copyErrorTitle: "No se puede copiar el token",
    },
    page: {
      eyebrow: "Integración con IA",
      title: "Acceso API",
      description:
        "Gestiona el token de portador personal que tus scripts y asistentes deben usar al llamar a MikoshiTracker.",
      tokenLabel: "Token API personal",
      tokenDescriptions: {
        empty: "Genera un token antes de intentar llamadas API autenticadas con portador.",
        fresh: "Oculto por defecto. Revélalo solo cuando necesites copiarlo en un cliente de confianza ahora mismo.",
        stored: "Este token ya está almacenado de forma segura. Rótalo para obtener un nuevo valor que puedas copiar.",
      },
      guidanceTitle: "Trata este token como una contraseña.",
      guidanceLines: [
        "Guárdalo en un almacén de secretos de confianza o en un archivo de entorno privado.",
        "La rotación invalida el token anterior de inmediato.",
      ],
      storedStateTitle: "Token ya almacenado de forma segura",
      storedStateDescription: "Los valores brutos del token se muestran solo una vez, justo después de su generación o rotación.",
      storedTokenValue: "Almacenado de forma segura — rota para revelar un nuevo token",
      lastRotatedLabel: "Última rotación",
      emptyStateTitle: "Aún no hay token API personal",
      emptyStateDescription: "Aún no se ha generado ningún token API personal.",
      actions: {
        generate: "Generar token",
        rotate: "Rotar token",
        reveal: "Revelar token",
        hide: "Ocultar token",
        copy: "Copiar token",
      },
      rotateConfirm: "Rotar este token invalida el valor anterior de inmediato. ¿Continuar?",
      disabledHint: "Los controles del token se desbloquean cuando se complete la solicitud actual.",
      quickstart: {
        eyebrow: "Inicio rápido",
        title: "Primera llamada",
        description: "Empieza con el encabezado portador, luego verifica la conexión con el endpoint del resumen de hoy.",
        docsLink: "Abrir documentación API",
        specLink: "OpenAPI JSON",
      },
      registration: {
        eyebrow: "Admin",
        title: "Acceso al registro",
        description: "Controla si los nuevos usuarios pueden crear cuentas locales desde la página de inicio de sesión.",
        enabled: "El registro está abierto",
        disabled: "El registro está cerrado",
        enableAction: "Reabrir registro",
        disableAction: "Cerrar registro",
        pendingHint: "Los controles de registro se desbloquean cuando se complete la solicitud actual.",
      },
    },
  },
};

export function getApiAccessCopy(locale: SupportedLocale) {
  return apiAccessCopy[locale];
}
