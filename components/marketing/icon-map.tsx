import type { ComponentType, SVGProps } from "react";
import {
  Check,
  Coins,
  Download,
  Flag,
  Github,
  Globe,
  Lock,
  Mail,
  Monitor,
  Shuffle,
  Sliders,
  Sparkle,
  TrendUp,
  Trophy,
  Users,
} from "@/components/icons";
import type { IconName } from "@/lib/marketing/content";

/**
 * Content lives in a plain .ts file, so it names icons by string. This is the
 * only place those names become components.
 */
export const ICONS: Record<IconName, ComponentType<SVGProps<SVGSVGElement>>> = {
  coins: Coins,
  trendUp: TrendUp,
  users: Users,
  monitor: Monitor,
  sparkle: Sparkle,
  sliders: Sliders,
  lock: Lock,
  download: Download,
  check: Check,
  trophy: Trophy,
  flag: Flag,
  shuffle: Shuffle,
  mail: Mail,
  github: Github,
  globe: Globe,
};
