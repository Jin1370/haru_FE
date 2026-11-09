import { RestartOptionScreen } from '@/components/settings/RestartOptionScreen';
import { getAppFont, setAppFont } from '@/constants/fonts';

export default function FontSettingsScreen() {
  return (
    <RestartOptionScreen
      titleKey="settings.font"
      current={getAppFont()}
      options={[
        { value: 'pixel', labelKey: 'settings.pixelFont' },
        { value: 'system', labelKey: 'settings.systemFont' },
      ]}
      save={setAppFont}
    />
  );
}
