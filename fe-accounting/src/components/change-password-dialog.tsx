import { useForm } from "@tanstack/react-form";
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

// Diekspor supaya halaman /user (form ganti password non-dialog) pakai aturan yang sama.
export const oldPasswordSchema = z.string().min(1, "Password lama wajib diisi.");
export const newPasswordSchema = z.string().min(8, "Password baru minimal 8 karakter.");

// Guide §9: aksi cepat ganti password dari dropdown header, tanpa pindah halaman.
export function ChangePasswordDialog({ open, onOpenChange }: ChangePasswordDialogProps) {
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
          <DialogTitle>Ganti Password</DialogTitle>
          <DialogDescription>Masukkan password lama dan password baru Anda.</DialogDescription>
        </DialogHeader>

        {success ? (
          <p role="status" className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
            Password berhasil diubah.
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
              validators={{ onChange: zodFieldValidator(oldPasswordSchema) }}
            >
              {(field) => (
                <div className="flex flex-col gap-1">
                  <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                    Password Lama
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
              validators={{ onChange: zodFieldValidator(newPasswordSchema) }}
            >
              {(field) => (
                <div className="flex flex-col gap-1">
                  <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                    Password Baru
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
                Batal
              </Button>
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Menyimpan..." : "Simpan"}
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
