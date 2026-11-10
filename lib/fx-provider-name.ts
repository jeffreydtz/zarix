export function formatFxProviderName(provider?: string | null): string {
  switch (provider) {
    case 'criptoya':
      return 'CriptoYa';
    case 'dolarapi':
      return 'DolarApi';
    case 'db':
      return 'último valor guardado';
    default:
      return provider?.trim() || '';
  }
}
