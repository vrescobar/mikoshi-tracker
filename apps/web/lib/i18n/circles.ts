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
  },
};

export function getCirclesCopy(locale: SupportedLocale): CirclesCopy {
  return circlesCopy[locale];
}
