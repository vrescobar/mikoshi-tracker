import type { SupportedLocale } from "./messages";

export type CirclesCopy = {
  page: {
    header: {
      eyebrow: string;
      title: string;
      description: string;
    };
    toolbar: {
      label: string;
      summary: (count: number) => string;
      newCircle: string;
    };
    feedback: {
      createPendingTitle: string;
      createPendingMessage: string;
      createSuccessTitle: string;
      createSuccessMessage: string;
      updatingErrorTitle: string;
    };
    card: {
      ownerRole: string;
      memberRole: string;
      createdLabel: string;
      viewDetails: string;
    };
    emptyState: {
      title: string;
      description: string;
    };
    overlay: {
      createTitle: string;
      createDescription: string;
      closeLabel: string;
      nameLabel: string;
      namePlaceholder: string;
      nameRequired: string;
      createSubmit: string;
      pendingSubmit: string;
      cancel: string;
      errorTitle: string;
    };
  };
  detail: {
    backToCircles: string;
    header: {
      eyebrow: string;
    };
    summary: {
      membersLabel: string;
      membersCount: (count: number) => string;
    };
    members: {
      title: string;
      description: string;
      ownerRole: string;
      memberRole: string;
      joinedLabel: string;
      youBadge: string;
      emptyState: string;
    };
    leaderboard: {
      title: string;
      description: string;
      statsNote: string;
      emptyState: string;
    };
    habitShares: {
      title: string;
      description: string;
      unshareNote: string;
      emptyState: string;
      sharedLabel: string;
      shareLabel: string;
      pendingLabel: string;
      errorTitle: string;
    };
    ownerPanel: {
      addMemberTitle: string;
      addMemberDescription: string;
      emailLabel: string;
      emailPlaceholder: string;
      externalIdLabel: string;
      externalIdDescription: string;
      externalIdPlaceholder: string;
      addMemberSubmit: string;
      addMemberPending: string;
      manageMembersTitle: string;
      manageMembersDescription: string;
      manageMembersEmpty: string;
      externalIdNone: string;
      editExternalIdLabel: string;
      saveLabel: string;
      cancelLabel: string;
      removeLabel: string;
      removeConfirm: (name: string) => string;
      tokensTitle: string;
      tokensDescription: string;
      mintNewToken: string;
      tokenLabelLabel: string;
      tokenLabelPlaceholder: string;
      mintSubmit: string;
      mintPending: string;
      mintCancel: string;
      revokeLabel: string;
      revokeConfirm: (label: string) => string;
      confirmLabel: string;
      tokenCreatedLabel: string;
      noTokens: string;
      tokensLoadError: string;
      freshTokenTitle: string;
      freshTokenWarning: string;
      revealLabel: string;
      hideLabel: string;
      copyLabel: string;
      copySuccess: string;
      errorTitle: string;
    };
  };
};

const circlesCopy: Record<SupportedLocale, CirclesCopy> = {
  en: {
    page: {
      header: {
        eyebrow: "Collaboration",
        title: "Circles",
        description: "Circles let you share selected habits with a group and track a shared leaderboard.",
      },
      toolbar: {
        label: "Your circles",
        summary: (count) => {
          if (count === 0) return "No circles in view";
          return `${count} ${count === 1 ? "circle" : "circles"} in view`;
        },
        newCircle: "New circle",
      },
      feedback: {
        createPendingTitle: "Creating circle",
        createPendingMessage: "The list will refresh once the new circle is ready.",
        createSuccessTitle: "Circle created",
        createSuccessMessage: "Invite members and share habits to start building your leaderboard.",
        updatingErrorTitle: "Unable to update circles",
      },
      card: {
        ownerRole: "Owner",
        memberRole: "Member",
        createdLabel: "Created",
        viewDetails: "View circle",
      },
      emptyState: {
        title: "No circles yet",
        description: "Create a circle to share habits with others and see a shared leaderboard.",
      },
      overlay: {
        createTitle: "Create a circle",
        createDescription:
          "A circle is a shared space where members track their habits together. You become the owner and can invite others, share your own habits, and issue circle tokens for external access.",
        closeLabel: "Close",
        nameLabel: "Circle name",
        namePlaceholder: "e.g. Morning Routines",
        nameRequired: "Add a name for this circle.",
        createSubmit: "Create circle",
        pendingSubmit: "Creating...",
        cancel: "Cancel",
        errorTitle: "Unable to create circle",
      },
    },
    detail: {
      backToCircles: "← Back to circles",
      header: {
        eyebrow: "Circle",
      },
      summary: {
        membersLabel: "Members",
        membersCount: (count) => `${count} ${count === 1 ? "member" : "members"}`,
      },
      members: {
        title: "Members",
        description: "Everyone in this circle.",
        ownerRole: "Owner",
        memberRole: "Member",
        joinedLabel: "Joined",
        youBadge: "you",
        emptyState: "No members yet.",
      },
      leaderboard: {
        title: "Leaderboard",
        description: "Members ranked by shared-habit activity. Live stats are visible to circle-token clients.",
        statsNote: "Stats available via circle token",
        emptyState: "Add members to see the leaderboard.",
      },
      habitShares: {
        title: "My Habits",
        description:
          "Choose which of your habits to share in this circle. Shared habits appear on the leaderboard and anyone holding a circle token can record check-ins on them.",
        unshareNote:
          "Unsharing a habit removes it from this circle immediately — the circle and any bot holding a circle token will no longer see it or record check-ins on it. Your check-in history is not deleted.",
        emptyState: "You have no active habits to share.",
        sharedLabel: "Shared",
        shareLabel: "Share",
        pendingLabel: "…",
        errorTitle: "Unable to update",
      },
      ownerPanel: {
        addMemberTitle: "Add a member",
        addMemberDescription:
          "Members can share their own habits in this circle and appear on the leaderboard. Add by email — the person must already have a Haaabit account.",
        emailLabel: "Email address",
        emailPlaceholder: "member@example.com",
        externalIdLabel: "External ID (optional)",
        externalIdDescription:
          "Links this member to an external identity, such as a WhatsApp number. An incorrect value pairs the wrong account. Leave blank if unsure.",
        externalIdPlaceholder: "e.g. +15551234567@s.whatsapp.net",
        addMemberSubmit: "Add member",
        addMemberPending: "Adding…",
        manageMembersTitle: "Manage members",
        manageMembersDescription:
          "Edit a member's external ID or remove them from the circle. Removing a member stops their habits from appearing here; their check-in history is not deleted.",
        manageMembersEmpty: "No other members to manage yet.",
        externalIdNone: "None",
        editExternalIdLabel: "Edit external ID",
        saveLabel: "Save",
        cancelLabel: "Cancel",
        removeLabel: "Remove",
        removeConfirm: (name) => `Remove ${name} from this circle? Their habit history is not deleted.`,
        tokensTitle: "Circle tokens",
        tokensDescription:
          "A circle token is a credential that lets an external agent (such as a WhatsApp bot) read shared habits and record check-ins for this whole circle. Treat it like a password — anyone who holds a token can write check-ins on behalf of any member. Revoke immediately if compromised.",
        mintNewToken: "Mint new token",
        tokenLabelLabel: "Label (optional)",
        tokenLabelPlaceholder: "e.g. Mikoshi bot",
        mintSubmit: "Mint token",
        mintPending: "Minting…",
        mintCancel: "Cancel",
        revokeLabel: "Revoke",
        revokeConfirm: (label) => `Revoke token "${label}"? Any integration using it will lose access immediately.`,
        confirmLabel: "Confirm",
        tokenCreatedLabel: "Created",
        noTokens: "No tokens issued yet.",
        tokensLoadError: "Unable to load tokens.",
        freshTokenTitle: "Token created — copy it now",
        freshTokenWarning:
          "This token is shown only once and cannot be retrieved after you leave this page. Copy it and store it securely before continuing.",
        revealLabel: "Reveal",
        hideLabel: "Hide",
        copyLabel: "Copy",
        copySuccess: "Copied!",
        errorTitle: "Something went wrong",
      },
    },
  },
  "zh-CN": {
    page: {
      header: {
        eyebrow: "协作",
        title: "圈子",
        description: "圈子让你与一组人分享指定的习惯，并共同追踪一个排行榜。",
      },
      toolbar: {
        label: "你的圈子",
        summary: (count) => {
          if (count === 0) return "当前没有圈子";
          return `当前有 ${count} 个圈子`;
        },
        newCircle: "新建圈子",
      },
      feedback: {
        createPendingTitle: "正在创建圈子",
        createPendingMessage: "新圈子准备好后，列表会自动刷新。",
        createSuccessTitle: "圈子已创建",
        createSuccessMessage: "邀请成员并分享习惯，开始构建你的排行榜吧。",
        updatingErrorTitle: "暂时无法更新圈子",
      },
      card: {
        ownerRole: "管理员",
        memberRole: "成员",
        createdLabel: "创建于",
        viewDetails: "查看圈子",
      },
      emptyState: {
        title: "还没有圈子",
        description: "创建一个圈子，与他人分享习惯并查看共同排行榜。",
      },
      overlay: {
        createTitle: "创建圈子",
        createDescription:
          "圈子是成员们一起追踪习惯的共享空间。你将成为管理员，可以邀请他人、分享自己的习惯，并为外部访问生成圈子令牌。",
        closeLabel: "关闭",
        nameLabel: "圈子名称",
        namePlaceholder: "例如：晨间习惯",
        nameRequired: "请为这个圈子填写名称。",
        createSubmit: "创建圈子",
        pendingSubmit: "创建中...",
        cancel: "取消",
        errorTitle: "暂时无法创建圈子",
      },
    },
    detail: {
      backToCircles: "← 返回圈子列表",
      header: {
        eyebrow: "圈子",
      },
      summary: {
        membersLabel: "成员",
        membersCount: (count) => `${count} 位成员`,
      },
      members: {
        title: "成员",
        description: "圈子里的所有人。",
        ownerRole: "管理员",
        memberRole: "成员",
        joinedLabel: "加入于",
        youBadge: "你",
        emptyState: "还没有成员。",
      },
      leaderboard: {
        title: "排行榜",
        description: "按共享习惯活跃度排名。实时数据可通过圈子令牌客户端获取。",
        statsNote: "通过圈子令牌查看统计",
        emptyState: "添加成员后即可查看排行榜。",
      },
      habitShares: {
        title: "我的习惯",
        description: "选择要在此圈子中分享的习惯。已分享的习惯会出现在排行榜上，拥有圈子令牌的人可以为其打卡。",
        unshareNote:
          "取消分享后，该习惯将立即从此圈子中移除——圈子和持有圈子令牌的机器人将不再看到该习惯，也无法为其打卡。打卡历史不会被删除。",
        emptyState: "你没有可以分享的活跃习惯。",
        sharedLabel: "已分享",
        shareLabel: "分享",
        pendingLabel: "…",
        errorTitle: "暂时无法更新",
      },
      ownerPanel: {
        addMemberTitle: "添加成员",
        addMemberDescription: "成员可以在此圈子中分享自己的习惯并出现在排行榜上。通过邮箱添加——此人必须已有 Haaabit 账号。",
        emailLabel: "邮箱地址",
        emailPlaceholder: "member@example.com",
        externalIdLabel: "外部 ID（可选）",
        externalIdDescription:
          "将该成员与外部身份（如 WhatsApp 号码）关联。填写错误会绑定错误账号，不确定时请留空。",
        externalIdPlaceholder: "例如：+15551234567@s.whatsapp.net",
        addMemberSubmit: "添加成员",
        addMemberPending: "添加中…",
        manageMembersTitle: "管理成员",
        manageMembersDescription: "编辑成员的外部 ID 或将其从圈子中移除。移除后其习惯将不再显示，但打卡历史不会被删除。",
        manageMembersEmpty: "暂无其他成员可管理。",
        externalIdNone: "未设置",
        editExternalIdLabel: "编辑外部 ID",
        saveLabel: "保存",
        cancelLabel: "取消",
        removeLabel: "移除",
        removeConfirm: (name) => `将 ${name} 从此圈子移除？其习惯历史不会被删除。`,
        tokensTitle: "圈子令牌",
        tokensDescription:
          "圈子令牌是凭证，允许外部代理（如 WhatsApp 机器人）读取共享习惯并为整个圈子记录打卡。请像保管密码一样保管它——持有令牌的任何人都可以代表任意成员写入打卡记录。如发生泄露，请立即撤销。",
        mintNewToken: "生成新令牌",
        tokenLabelLabel: "标签（可选）",
        tokenLabelPlaceholder: "例如：Mikoshi 机器人",
        mintSubmit: "生成令牌",
        mintPending: "生成中…",
        mintCancel: "取消",
        revokeLabel: "撤销",
        revokeConfirm: (label) => `撤销令牌"${label}"？使用该令牌的集成将立即失去访问权限。`,
        confirmLabel: "确认",
        tokenCreatedLabel: "创建于",
        noTokens: "尚未发放任何令牌。",
        tokensLoadError: "暂时无法加载令牌。",
        freshTokenTitle: "令牌已创建——请立即复制",
        freshTokenWarning: "此令牌仅显示一次，离开此页面后无法再次查看。请在继续操作前将其复制并安全保存。",
        revealLabel: "显示",
        hideLabel: "隐藏",
        copyLabel: "复制",
        copySuccess: "已复制！",
        errorTitle: "操作失败",
      },
    },
  },
  es: {
    page: {
      header: {
        eyebrow: "Colaboración",
        title: "Círculos",
        description: "Los círculos te permiten compartir hábitos seleccionados con un grupo y seguir una clasificación compartida.",
      },
      toolbar: {
        label: "Tus círculos",
        summary: (count) => {
          if (count === 0) return "No hay círculos en vista";
          return `${count} ${count === 1 ? "círculo" : "círculos"} en vista`;
        },
        newCircle: "Nuevo círculo",
      },
      feedback: {
        createPendingTitle: "Creando círculo",
        createPendingMessage: "La lista se actualizará una vez que el nuevo círculo esté listo.",
        createSuccessTitle: "Círculo creado",
        createSuccessMessage: "Invita miembros y comparte hábitos para empezar a construir tu clasificación.",
        updatingErrorTitle: "No se pueden actualizar los círculos",
      },
      card: {
        ownerRole: "Propietario",
        memberRole: "Miembro",
        createdLabel: "Creado",
        viewDetails: "Ver círculo",
      },
      emptyState: {
        title: "Aún no hay círculos",
        description: "Crea un círculo para compartir hábitos con otros y ver una clasificación compartida.",
      },
      overlay: {
        createTitle: "Crear un círculo",
        createDescription:
          "Un círculo es un espacio compartido donde los miembros siguen sus hábitos juntos. Te conviertes en el propietario y puedes invitar a otros, compartir tus propios hábitos y emitir tokens del círculo para acceso externo.",
        closeLabel: "Cerrar",
        nameLabel: "Nombre del círculo",
        namePlaceholder: "p. ej. Rutinas matutinas",
        nameRequired: "Añade un nombre para este círculo.",
        createSubmit: "Crear círculo",
        pendingSubmit: "Creando...",
        cancel: "Cancelar",
        errorTitle: "No se puede crear el círculo",
      },
    },
    detail: {
      backToCircles: "← Volver a círculos",
      header: {
        eyebrow: "Círculo",
      },
      summary: {
        membersLabel: "Miembros",
        membersCount: (count) => `${count} ${count === 1 ? "miembro" : "miembros"}`,
      },
      members: {
        title: "Miembros",
        description: "Todos en este círculo.",
        ownerRole: "Propietario",
        memberRole: "Miembro",
        joinedLabel: "Se unió",
        youBadge: "tú",
        emptyState: "Aún no hay miembros.",
      },
      leaderboard: {
        title: "Clasificación",
        description:
          "Miembros clasificados por actividad en hábitos compartidos. Las estadísticas en vivo son visibles para los clientes con token del círculo.",
        statsNote: "Estadísticas disponibles vía token del círculo",
        emptyState: "Añade miembros para ver la clasificación.",
      },
      habitShares: {
        title: "Mis hábitos",
        description:
          "Elige cuáles de tus hábitos compartir en este círculo. Los hábitos compartidos aparecen en la clasificación y cualquiera con un token del círculo puede registrar registros en ellos.",
        unshareNote:
          "Dejar de compartir un hábito lo elimina de este círculo de inmediato — el círculo y cualquier bot con un token del círculo ya no lo verán ni registrarán registros en él. Tu historial de registros no se elimina.",
        emptyState: "No tienes hábitos activos para compartir.",
        sharedLabel: "Compartido",
        shareLabel: "Compartir",
        pendingLabel: "…",
        errorTitle: "No se puede actualizar",
      },
      ownerPanel: {
        addMemberTitle: "Añadir miembro",
        addMemberDescription:
          "Los miembros pueden compartir sus propios hábitos en este círculo y aparecer en la clasificación. Añadir por correo — la persona debe tener ya una cuenta de Haaabit.",
        emailLabel: "Dirección de correo",
        emailPlaceholder: "miembro@ejemplo.com",
        externalIdLabel: "ID externo (opcional)",
        externalIdDescription:
          "Vincula este miembro a una identidad externa, como un número de WhatsApp. Un valor incorrecto empareja la cuenta equivocada. Déjalo en blanco si no estás seguro.",
        externalIdPlaceholder: "p. ej. +15551234567@s.whatsapp.net",
        addMemberSubmit: "Añadir miembro",
        addMemberPending: "Añadiendo…",
        manageMembersTitle: "Gestionar miembros",
        manageMembersDescription:
          "Edita el ID externo de un miembro o elimínalo del círculo. Eliminar a un miembro impide que sus hábitos aparezcan aquí; su historial de registros no se elimina.",
        manageMembersEmpty: "Aún no hay otros miembros que gestionar.",
        externalIdNone: "Ninguno",
        editExternalIdLabel: "Editar ID externo",
        saveLabel: "Guardar",
        cancelLabel: "Cancelar",
        removeLabel: "Eliminar",
        removeConfirm: (name) => `¿Eliminar a ${name} de este círculo? Su historial de hábitos no se elimina.`,
        tokensTitle: "Tokens del círculo",
        tokensDescription:
          "Un token del círculo es una credencial que permite a un agente externo (como un bot de WhatsApp) leer hábitos compartidos y registrar registros para todo el círculo. Trátalo como una contraseña — cualquiera que tenga un token puede escribir registros en nombre de cualquier miembro. Revócalo inmediatamente si se ve comprometido.",
        mintNewToken: "Generar nuevo token",
        tokenLabelLabel: "Etiqueta (opcional)",
        tokenLabelPlaceholder: "p. ej. Bot de Mikoshi",
        mintSubmit: "Generar token",
        mintPending: "Generando…",
        mintCancel: "Cancelar",
        revokeLabel: "Revocar",
        revokeConfirm: (label) =>
          `¿Revocar el token "${label}"? Cualquier integración que lo use perderá el acceso de inmediato.`,
        confirmLabel: "Confirmar",
        tokenCreatedLabel: "Creado",
        noTokens: "Aún no se han emitido tokens.",
        tokensLoadError: "No se pueden cargar los tokens.",
        freshTokenTitle: "Token creado — cópialo ahora",
        freshTokenWarning:
          "Este token se muestra solo una vez y no se puede recuperar después de salir de esta página. Cópialo y guárdalo de forma segura antes de continuar.",
        revealLabel: "Mostrar",
        hideLabel: "Ocultar",
        copyLabel: "Copiar",
        copySuccess: "¡Copiado!",
        errorTitle: "Algo salió mal",
      },
    },
  },
};

export function getCirclesCopy(locale: SupportedLocale): CirclesCopy {
  return circlesCopy[locale];
}
