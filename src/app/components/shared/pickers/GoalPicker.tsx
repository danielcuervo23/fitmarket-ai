import {
  Apple,
  Dumbbell,
  Flame,
  PiggyBank,
  Users,
  Zap,
} from "lucide-react";
import type { GoalType } from "@/lib/goals";
import { useI18n } from "@/i18n/I18nProvider";
import { ChoiceCard } from "@/app/ui";

const GOALS: { id: GoalType; icon: typeof Dumbbell }[] = [
  { id: "muscle", icon: Dumbbell },
  { id: "fat", icon: Flame },
  { id: "healthy", icon: Apple },
  { id: "save", icon: PiggyBank },
  { id: "family", icon: Users },
  { id: "energy", icon: Zap },
];

interface Props {
  value: GoalType[];
  onChange: (value: GoalType[]) => void;
  disabled?: boolean;
  label: string;
}

/** Multi-select grid of nutrition goals (setup flow and settings). */
export function GoalPicker({ value, onChange, disabled, label }: Props) {
  const { t } = useI18n();

  const toggle = (id: GoalType) =>
    onChange(
      value.includes(id) ? value.filter((goal) => goal !== id) : [...value, id],
    );

  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 gap-3">
      {GOALS.map(({ id, icon: Icon }) => (
        <ChoiceCard
          key={id}
          layout="tile"
          selected={value.includes(id)}
          onSelect={() => toggle(id)}
          icon={<Icon size={22} />}
          title={t(`goal.${id}`)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
