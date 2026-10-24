import { forwardRef, useState, type ComponentProps } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { useI18n } from "@/i18n/I18nProvider";
import { TextField } from "./TextField";

type PasswordFieldProps = Omit<
  ComponentProps<typeof TextField>,
  "type" | "icon" | "trailing"
>;

/** TextField with a lock icon and a show/hide toggle. */
export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(props, ref) {
    const { t } = useI18n();
    const [visible, setVisible] = useState(false);

    return (
      <TextField
        ref={ref}
        type={visible ? "text" : "password"}
        icon={<Lock size={17} />}
        trailing={
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={visible ? t("auth.hidePassword") : t("auth.showPassword")}
            aria-pressed={visible}
            className="-mr-1 flex size-8 items-center justify-center rounded-full text-ink-400 transition-colors hover:text-ink-700"
          >
            {visible ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        }
        {...props}
      />
    );
  },
);
