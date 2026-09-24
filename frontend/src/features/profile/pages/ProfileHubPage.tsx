import { Header } from "@/components/layout/Header";
import { HubLinkCard } from "@/components/ui/HubLinkCard";
import { ThemeSelector } from "@/features/theme/ThemeSelector";
import { useUserStore } from "@/store/userStore";
import { isAdminUser } from "@/utils/adminAccess";
import { subscriptionLabel } from "@/utils/localization";
import { hasPlus } from "@/features/subscription/subscriptionAccess";

export function ProfileHubPage() {
  const user = useUserStore((state) => state.user);
  const accountLabel = user?.auth_email || (user?.username ? `@${user.username.replace(/^@/, "")}` : "Аккаунт");

  return (
    <section>
      <Header title="Профиль" subtitle="Аккаунт, настройки и ваши связи" />
      <div className="mb-3 app-card app-card-plum flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-tg-text">{accountLabel}</p>
          <p className="mt-1 text-xs text-tg-hint">Профиль и подписка</p>
        </div>
        {user ? <span className="app-chip app-chip-info shrink-0">{hasPlus(user) ? "PLUS" : subscriptionLabel(user.subscription_status)}</span> : null}
      </div>
      <div className="space-y-3">
        <HubLinkCard to="/profile/settings" title="Настройки профиля" description="Цели, программа, питание, добавки и аккаунт" icon="settings" tone="plum" />
        <HubLinkCard to="/notifications" title="Уведомления" description="Канал доставки, тихие часы и виды напоминаний" icon="notifications" tone="ocean" />
        <HubLinkCard to="/social" title="Друзья и соревнования" description="Сравнивайте регулярность без раскрытия личных данных" icon="social" tone="indigo" />
        <HubLinkCard to="/invite" title="Пригласить друга" description="Поделитесь ссылкой или примите приглашение по коду" icon="invite" tone="ember" />
        <HubLinkCard to="/measurements" title="Замеры" description="Вес, обхваты и динамика — также доступны в Дневнике" icon="measurements" tone="indigo" />
        {isAdminUser(user) ? <HubLinkCard to="/admin" title="Админ" description="Пользователи, каталог и состояние системы" icon="admin" tone="ember" /> : null}
      </div>
      <div className="mt-3"><ThemeSelector /></div>
    </section>
  );
}
