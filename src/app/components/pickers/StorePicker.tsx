import type { SupermarketId } from "@/lib/supermarkets";
import { useI18n } from "@/i18n/I18nProvider";
import { ChoiceCard } from "@/app/ui";

/** Chain names are brand names, so they are not translated. */
const STORES: { id: SupermarketId; name: string }[] = [
  { id: "D1", name: "D1" },
  { id: "Ara", name: "Ara" },
  { id: "Exito", name: "Éxito" },
  { id: "Jumbo", name: "Jumbo" },
  { id: "Carulla", name: "Carulla" },
];

interface Props {
  value: SupermarketId[];
  onChange: (value: SupermarketId[]) => void;
  disabled?: boolean;
  label: string;
}

/** Multi-select list of supermarket chains (setup flow and settings). */
export function StorePicker({ value, onChange, disabled, label }: Props) {
  const { t } = useI18n();

  const toggle = (id: SupermarketId) =>
    onChange(
      value.includes(id)
        ? value.filter((store) => store !== id)
        : [...value, id],
    );

  return (
    <div role="group" aria-label={label} className="flex flex-col gap-3">
      {STORES.map(({ id, name }) => (
        <ChoiceCard
          key={id}
          selected={value.includes(id)}
          onSelect={() => toggle(id)}
          icon={<span className="text-lg font-extrabold">{name[0]}</span>}
          title={name}
          description={t(`store.${id}.tagline`)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
