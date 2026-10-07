import { request } from '@/api/client';

/** GET/PUT /notifications/preferences (any signed-in user). */
export interface NotificationPreferences {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  telegramEnabled: boolean;
  phone: string | null;
  remindBeforeHours: number;
  remindForAppointment: boolean;
  remindForQueue: boolean;
  remindForResults: boolean;
}

export const getPreferences = () => request<NotificationPreferences>('GET', '/notifications/preferences');

export const savePreferences = (prefs: NotificationPreferences) =>
  request<NotificationPreferences>('PUT', '/notifications/preferences', prefs);
