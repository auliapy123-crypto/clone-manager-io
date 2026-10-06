import { useForm } from "@tanstack/react-form";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useChangePassword } from "@/hooks/use-auth";
import { getApiErrorMessage } from "@/lib/errors";
import { zodFieldValidator } from "@/lib/form-validators";

export interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Diekspor supaya halaman /user (form ganti password non-dialog) pakai aturan
// yang sama. Factory per-render: pesan validasi ikut bahasa aktif (reaktif).
export function makeOldPasswordSchema(t: TFunction) {
  return z.string().min(1, t("changePassword.oldRequired"));
}
export function makeNewPasswordSchema(t: TFunction) {
  return z.string().min(8, t("changePassword.newMinLength"));
}

// Guide §9: aksi cepat ganti password dari dropdown header, tanpa pindah halaman.
export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
  const { t } = useTranslation();
  const changePassword = useChangePassword();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm({
    defaultValues: { oldPassword: "", newPassword: "" },
    onSubmit: async ({ value, formApi }) => {
      setServerError(null);
      try {
        await changePassword.mutateAsync(value);
        setSuccess(true);
        formApi.reset();
      } catch (err) {
        setServerError(getApiErrorMessage(err));
      }
    },
  });

  const close = () => {
    onOpenChange(false);
    setServerError(null);
    setSuccess(false);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent onClose={close}>
        <DialogHeader>
          <DialogTitle>{t("changePassword.title")}</DialogTitle>
          <DialogDescription>{t("changePassword.description")}</DialogDescription>
        </DialogHeader>

        {success ? (
          <p role="status" className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
            {t("changePassword.success")}
          </p>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <form.Field
              name="oldPassword"
              validators={{ onChange: zodFieldValidator(makeOldPasswordSchema(t)) }}
            >
              {(field) => (
                <div className="flex flex-col gap-1">
                  <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                    {t("changePassword.oldPassword")}
                  </label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete="current-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-xs text-red-600">{field.state.meta.errors.join(", ")}</p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field
              name="newPassword"
              validators={{ onChange: zodFieldValidator(makeNewPasswordSchema(t)) }}
            >
              {(field) => (
                <div className="flex flex-col gap-1">
                  <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                    {t("changePassword.newPassword")}
                  </label>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="password"
                    autoComplete="new-password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-xs text-red-600">{field.state.meta.errors.join(", ")}</p>
                  )}
                </div>
              )}
            </form.Field>

            {serverError && (
              <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                {serverError}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t("common.cancel")}
              </Button>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? t("common.submitting") : t("common.save")}
                  </Button>
                )}
              </form.Subscribe>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
