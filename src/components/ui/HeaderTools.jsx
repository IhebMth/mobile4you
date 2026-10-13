import NotificationBell from '../notifications/NotificationBell'
import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'

// The little group of tools shown at the top of every page: [FR|EN]  [dark mode]  [bell].
export default function HeaderTools({ onDark = false }) {
  return (
    <div className="flex items-center gap-2">
      <LanguageSwitcher onDark={onDark} />
      <ThemeToggle onDark={onDark} />
      <NotificationBell onDark={onDark} />
    </div>
  )
}
