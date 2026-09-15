import { createFileRoute, redirect } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  newPasswordSchema,
  oldPasswordSchema,
} from "@/components/change-password-dialog";
import { Header } from "@/components/header";
import { useChangePassword, useMe } from "@/hooks/use-auth";
import { getAccessToken } from "@/lib/auth/cookies";
import { getApiErrorMessage } from "@/lib/errors";
import { zodFieldValidator } from "@/lib/form-validators";

// Guide §9: profil user aktif + form ganti password (versi halaman, bukan dialog).
export const Route = createFileRoute("/user")({
  beforeLoad: () => {
    if (!getAccessToken()) {
      throw redirect({ to: "/login" });
    }
  },
  component: UserProfilePage,
});

function UserProfilePage() {
  return (
    <>
      <Header />
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <h1 className="text-lg font-semibold text-gray-900">Profil Saya</h1>
        <ProfileCard />
        <ChangePasswordCard />
      </div>
    </>
  );
}

function ProfileCard() {
  const { data: user, isPending, isError, error } = useMe();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informasi Akun</CardTitle>
        <CardDescription>Data akun yang digunakan untuk login.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending ? (
          <p className="text-sm text-gray-500">Memuat profil...</p>
        ) : isError ? (
          <p role="alert" className="text-sm text-red-700">
            {getApiErrorMessage(error)}
          </p>
        ) : (
          <>
            <div>
              <p className="text-xs font-medium uppercase text-gray-400">Nama</p>
              <p className="text-sm text-gray-900">{user.name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-400">Email</p>
              <p className="text-sm text-gray-900">{user.email}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const changePassword = useChangePassword();
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm({
    defaultValues: { oldPassword: "", newPassword: "" },
    onSubmit: async ({ value, formApi }) => {
      setServerError(null);
      setSuccess(false);
      try {
        await changePassword.mutateAsync(value);
        setSuccess(true);
        formApi.reset();
      } catch (err) {
        setServerError(getApiErrorMessage(err));
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ganti Password</CardTitle>
        <CardDescription>Masukkan password lama dan password baru Anda.</CardDescription>
      </CardHeader>
      <CardContent>
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
          {success && (
            <p role="status" className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">
              Password berhasil diubah.
            </p>
          )}

          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting} className="self-start">
                {isSubmitting ? "Menyimpan..." : "Simpan"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
