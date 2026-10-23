import {
  Bean,
  Fish,
  Ham,
  Milk,
  Nut,
  Salad,
  Shrimp,
  Sprout,
  Wheat,
} from "lucide-react";
import {
  MAX_OTHER_FOODS_LENGTH,
  type DietaryRestrictionId,
} from "@/lib/dietaryRestrictions";
import { useI18n } from "@/i18n/I18nProvider";
import { ChoiceCard, TextField } from "@/app/ui";

const OPTIONS: { id: DietaryRestrictionId; icon: typeof Milk }[] = [
  { id: "lactose", icon: Milk },
  { id: "gluten", icon: Wheat },
  { id: "pork", icon: Ham },
  { id: "fish", icon: Fish },
  { id: "shellfish", icon: Shrimp },
  { id: "peanut", icon: Bean },
  { id: "nuts", icon: Nut },
  { id: "vegetarian", icon: Salad },
  { id: "vegan", icon: Sprout },
];

interface Props {
  selected: DietaryRestrictionId[];
  onSelectedChange: (value: DietaryRestrictionId[]) => void;
  otherFoods: string;
  onOtherFoodsChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}

/** Restriction tiles plus a free-text field for other foods to avoid. */
export function DietaryPicker({
  selected,
  onSelectedChange,
  otherFoods,
  onOtherFoodsChange,
  disabled,
  label,
}: Props) {
  const { t } = useI18n();

  const toggle = (id: DietaryRestrictionId) =>
    onSelectedChange(
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id],
    );

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label={label} className="grid grid-cols-2 gap-3">
        {OPTIONS.map(({ id, icon: Icon }) => (
          <ChoiceCard
            key={id}
            layout="tile"
            selected={selected.includes(id)}
            onSelect={() => toggle(id)}
            icon={<Icon size={22} />}
            title={t(`dietary.${id}`)}
            disabled={disabled}
          />
        ))}
      </div>

      <TextField
        label={t("dietary.other")}
        placeholder={t("dietary.otherPlaceholder")}
        hint={t("dietary.otherHint")}
        maxLength={MAX_OTHER_FOODS_LENGTH}
        value={otherFoods}
        disabled={disabled}
        onChange={(event) => onOtherFoodsChange(event.target.value)}
      />
    </div>
  );
}
