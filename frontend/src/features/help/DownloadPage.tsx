import { Link } from "react-router-dom";

export function DownloadPage() {
  return <main className="app-shell mx-auto min-h-screen max-w-xl space-y-4 px-4 pb-8 pt-[calc(1rem+env(safe-area-inset-top))] text-tg-text">
    <h1 className="text-2xl font-semibold">FilFit для Android</h1>
    <div className="app-card space-y-3 p-4">
      <p>Тренировки, питание и дневник в приложении на телефоне.</p>
      {import.meta.env.MODE !== "android" ? <>
        <a href="https://app.filfitclub.ru/android/latest.apk" className="app-button app-primary-action app-gradient-action flex min-h-11 items-center justify-center px-4 py-3">Скачать APK</a>
        <p className="text-sm">Откройте скачанный файл. Если Android запросит доступ, разрешите установку для браузера или файлового менеджера, которым открыли APK. После установки доступ можно выключить.</p>
        <p className="text-sm">Установите поверх прежней версии. Удалять приложение не нужно: так сохранятся вход и дневник.</p>
      </> : <p>Для обновления откройте Главную с интернетом и следуйте предложению приложения.</p>}
    </div>
    <Link to="/faq?article=notifications" className="app-button app-secondary-action flex min-h-11 items-center justify-center px-3 py-3 text-center">Настройка уведомлений Android</Link>
    <Link to="/" className="flex min-h-11 items-center justify-center text-tg-link">Открыть FilFit</Link>
  </main>;
}
