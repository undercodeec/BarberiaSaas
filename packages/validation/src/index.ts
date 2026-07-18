import { z } from 'zod';

export const appEnvironmentSchema = z.enum([
  'local',
  'preview',
  'staging',
  'production',
]);

export const publicSupabaseConfigSchema = z.object({
  anonKey: z.string().min(1, 'La clave pública de Supabase es obligatoria.'),
  url: z.url('La URL de Supabase no es válida.'),
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type PublicSupabaseConfig = z.infer<typeof publicSupabaseConfigSchema>;
