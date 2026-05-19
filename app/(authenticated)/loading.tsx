/**
 * UI inmediata al navegar/iniciar rutas autenticadas (RSC en vuelo).
 * Pantalla de marca animada para que la espera (web + móvil/PWA) no desespere.
 */
import BrandLoader from '@/components/ui/BrandLoader';

export default function AuthenticatedLoading() {
  return <BrandLoader />;
}
