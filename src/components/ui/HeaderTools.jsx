import NotificationBell from '../notifications/NotificationBell'
import LanguageSwitcher from './LanguageSwitcher'

// The little group of tools shown at the top of every page: [FR|EN]  [bell].
// Later steps add the dark-mode button right here, between the two.
export default function HeaderTools({ onDark = false }) {
  return (
    <div className="flex items-center gap-2">
      <LanguageSwitcher onDark={onDark} />
      {/* dark-mode toggle will go here (next step) */}
      <NotificationBell onDark={onDark} />
    </div>
  )
}
