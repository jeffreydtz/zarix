import { z } from 'zod';

/** RF14: the two presentation settings offered by Configuración. */
export const presentationPreferencesSchema = z.object({
  default_currency: z.enum(['ARS', 'USD']),
  net_worth_widget_visible: z.boolean(),
}).strict();

export type PresentationPreferences = z.infer<typeof presentationPreferencesSchema>;
export type PresentationCurrency = PresentationPreferences['default_currency'];
export const PRESENTATION_PREFERENCES_COLUMNS = 'default_currency, net_worth_widget_visible';
