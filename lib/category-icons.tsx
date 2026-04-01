import type { LucideIcon } from 'lucide-react';
import {
  Car,
  ShoppingCart,
  Home,
  Utensils,
  HeartPulse,
  GraduationCap,
  Film,
  Shirt,
  Plane,
  Wallet,
  Target,
  Smartphone,
  Zap,
  Fuel,
  Bus,
  Train,
  Pill,
  Stethoscope,
  Dumbbell,
  Gift,
  PawPrint,
  Baby,
  Briefcase,
  Building2,
  TrendingUp,
  Landmark,
  CreditCard,
  Wrench,
  Wifi,
  Globe,
} from 'lucide-react';

export const EMOJI_ICONS = [
  '🍔', '🍕', '🌮', '🍣', '🥗', '☕', '🍺', '🍷', '🛒', '🧾',
  '🏠', '🛋️', '🧹', '🔧', '🧱', '🚿', '🛏️',
  '🚗', '🛵', '🚌', '⛽', '🅿️', '🚕', '🚆', '✈️',
  '💊', '🏥', '🦷', '🩺', '🧠',
  '🎓', '📚', '📝', '💻',
  '🎮', '🎬', '🎵', '🎟️', '⚽', '🏋️',
  '👕', '👟', '👜', '⌚',
  '💰', '💵', '💳', '🏦', '📈', '📉', '🪙', '💎',
  '📱', '📺', '🧰', '🔌', '⚡', '🌐',
  '🎁', '❤️', '🐶', '👶', '🧒', '👪',
  '🧳', '🗺️', '🏨', '🌴',
  '🧺', '📦', '🧯', '🪑',
  '🎯', '✅', '⭐', '📌',
];

export const LUCIDE_ICON_OPTIONS = [
  'car', 'shopping-cart', 'house', 'utensils', 'heart-pulse', 'graduation-cap',
  'film', 'shirt', 'plane', 'wallet', 'target', 'smartphone',
  'zap', 'fuel', 'bus', 'train', 'pill', 'stethoscope',
  'dumbbell', 'gift', 'paw-print', 'baby', 'briefcase', 'building-2',
  'trending-up', 'landmark', 'credit-card', 'wrench', 'wifi', 'globe',
] as const;

const LUCIDE_MAP: Record<string, LucideIcon> = {
  car: Car,
  'shopping-cart': ShoppingCart,
  house: Home,
  utensils: Utensils,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  film: Film,
  shirt: Shirt,
  plane: Plane,
  wallet: Wallet,
  target: Target,
  smartphone: Smartphone,
  zap: Zap,
  fuel: Fuel,
  bus: Bus,
  train: Train,
  pill: Pill,
  stethoscope: Stethoscope,
  dumbbell: Dumbbell,
  gift: Gift,
  'paw-print': PawPrint,
  baby: Baby,
  briefcase: Briefcase,
  'building-2': Building2,
  'trending-up': TrendingUp,
  landmark: Landmark,
  'credit-card': CreditCard,
  wrench: Wrench,
  wifi: Wifi,
  globe: Globe,
};

export function isLucideIconValue(icon: string | null | undefined): boolean {
  return Boolean(icon && icon.startsWith('lucide:'));
}

export function iconValueFromLucideName(name: string): string {
  return `lucide:${name}`;
}

export function getOptionTextIcon(icon: string | null | undefined): string {
  if (!icon) return '🎯';
  if (isLucideIconValue(icon)) return '◻️';
  return icon;
}

export function CategoryIcon({
  icon,
  className,
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  const value = icon || '🎯';

  if (isLucideIconValue(value)) {
    const name = value.replace('lucide:', '');
    const Icon = LUCIDE_MAP[name];
    if (Icon) {
      return <Icon className={className || 'w-5 h-5'} />;
    }
  }

  return <span>{value}</span>;
}
