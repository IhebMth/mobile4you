import LanguageSwitcher from './LanguageSwitcher'
import ThemeToggle from './ThemeToggle'

// FR|EN + dark mode in the top corner of the pages without a menu (login, forgot password, client tracking page).
// The page around it must have className "relative".
export default function CornerTools() {
  return (
    <div className="absolute top-4 end-4 z-10 flex items-center gap-2">
      <LanguageSwitcher />
      <ThemeToggle />
    </div>
  )
}
