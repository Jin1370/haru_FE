import { RestartOptionScreen } from '@/components/settings/RestartOptionScreen';
import { getAppTheme, setAppTheme } from '@/constants/theme';

export default function ThemeSettingsScreen() {
  return (
    <RestartOptionScreen
      titleKey="settings.theme"
      current={getAppTheme()}
      options={[
        { value: 'day', labelKey: 'settings.themeDay' },
        { value: 'night', labelKey: 'settings.themeNight' },
      ]}
      save={setAppTheme}
    />
  );
}
