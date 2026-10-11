import {
  AlignLeft,
  Bell,
  Bookmark,
  CalendarDays,
  CheckSquare,
  CircleDashed,
  Clock,
  Coins,
  FileText,
  Flag,
  Folder,
  Hash,
  Heart,
  Home,
  Image,
  Lightbulb,
  Link,
  List,
  MapPin,
  MessageSquare,
  Package,
  Percent,
  Plane,
  Sparkles,
  Star,
  Table2,
  Tags,
  TrendingUp,
  User,
  Users,
  Zap,
} from "lucide-react";

/**
 * Ícones que o usuário pode escolher para um database ou para uma propriedade
 * (estilo Notion). A opção `null` ("Automático"/"Padrão") mantém o ícone padrão.
 */
export const ICON_OPTIONS: { name: string; icon: typeof AlignLeft }[] = [
  { name: "AlignLeft", icon: AlignLeft },
  { name: "Hash", icon: Hash },
  { name: "List", icon: List },
  { name: "Tags", icon: Tags },
  { name: "CircleDashed", icon: CircleDashed },
  { name: "CalendarDays", icon: CalendarDays },
  { name: "Clock", icon: Clock },
  { name: "CheckSquare", icon: CheckSquare },
  { name: "User", icon: User },
  { name: "Users", icon: Users },
  { name: "FileText", icon: FileText },
  { name: "Link", icon: Link },
  { name: "Coins", icon: Coins },
  { name: "Percent", icon: Percent },
  { name: "TrendingUp", icon: TrendingUp },
  { name: "Star", icon: Star },
  { name: "Heart", icon: Heart },
  { name: "Flag", icon: Flag },
  { name: "Bookmark", icon: Bookmark },
  { name: "Bell", icon: Bell },
  { name: "Folder", icon: Folder },
  { name: "Image", icon: Image },
  { name: "MapPin", icon: MapPin },
  { name: "MessageSquare", icon: MessageSquare },
  { name: "Package", icon: Package },
  { name: "Plane", icon: Plane },
  { name: "Home", icon: Home },
  { name: "Lightbulb", icon: Lightbulb },
  { name: "Sparkles", icon: Sparkles },
  { name: "Zap", icon: Zap },
];

/** Mapa nome → componente, para resolver um `icon` persistido. */
export const ICON_BY_NAME: Record<string, typeof AlignLeft> =
  Object.fromEntries(ICON_OPTIONS.map((option) => [option.name, option.icon]));

/**
 * Resolve o ícone de um database a partir do nome persistido. Quando ausente ou
 * desconhecido, cai no ícone padrão de database (`Table2`).
 */
export function databaseIcon(icon: string | null | undefined) {
  if (icon) {
    const custom = ICON_BY_NAME[icon];
    if (custom) return custom;
  }
  return Table2;
}
