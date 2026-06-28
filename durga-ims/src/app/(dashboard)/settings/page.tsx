
import { getCompanySettings } from "@/lib/actions/settings.actions";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const settings = await getCompanySettings();
  return <SettingsClient initialSettings={settings} />;
}
