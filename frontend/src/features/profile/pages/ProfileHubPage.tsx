import { useEffect, useState } from "react";

import { fetchMyProfile, type UserProfile } from "@/api/users";
import { Header } from "@/components/layout/Header";
import { HubLinkCard } from "@/components/ui/HubLinkCard";
import { StatusNotice } from "@/components/ui/StatusNotice";
import { ProfileHeroCard } from "@/features/profile/components/ProfileHeroCard";
import { ThemeSelector } from "@/features/theme/ThemeSelector";
import { useUserStore } from "@/store/userStore";
import { isAdminUser } from "@/utils/adminAccess";

export function ProfileHubPage() {
  const user = useUserStore((state) => state.user);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchMyProfile().then((saved) => {
      if (!cancelled) { setProfile(saved); setProfileError(false); }
    }).catch(() => {
      if (!cancelled) setProfileError(true);
    });
    return () => { cancelled = true; };
  }, [user]);

  return (
    <section>
      <Header title="Профиль" subtitle="Аккаунт, настройки и ваши связи" />
      <ProfileHeroCard user={user} profile={profile} />
      {profileError ? <StatusNotice tone="info" className="mb-3 text-xs">Показаны данные аккаунта. Вес и рост обновятся после подключения.</StatusNotice> : null}
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
