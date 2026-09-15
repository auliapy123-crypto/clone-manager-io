import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { BusinessRole } from "@/config/menuConfig";
import { useMe } from "@/hooks/use-auth";
import { useBusinesses } from "@/hooks/use-businesses";
import {
  type AddMemberInput,
  type BusinessMember,
  useAddMember,
  useMembers,
  useRemoveMember,
  useUpdateMemberRole,
} from "@/hooks/use-members";
import { getApiErrorMessage } from "@/lib/errors";
import { zodFieldValidator } from "@/lib/form-validators";

// Guide §7.2, §7 RBAC: daftar & kelola anggota bisnis aktif (GET/POST/PATCH/DELETE /users).
export const Route = createFileRoute("/businesses/$businessId/members")({
  component: MembersPage,
});

const ROLE_LABEL: Record<BusinessRole, string> = {
  admin: "Admin",
  accountant: "Akuntan",
  viewer: "Viewer",
};

const ROLE_OPTIONS: BusinessRole[] = ["admin", "accountant", "viewer"];

function MembersPage() {
  const { businessId } = Route.useParams();
  const { data: businesses } = useBusinesses();
  const { data: me } = useMe();
  const currentRole = businesses?.find((b) => b.id === businessId)?.role;
  const isAdmin = currentRole === "admin";

  const [page, setPage] = useState(1);
  const { data, isPending, isError, error } = useMembers(businessId, page);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Anggota Bisnis</h1>
        {isAdmin && <Button onClick={() => setAddOpen(true)}>Tambah Anggota</Button>}
      </div>

      <Card>
        <CardContent className="p-0">
          {isPending ? (
            <p className="p-6 text-sm text-gray-500">Memuat anggota...</p>
          ) : isError ? (
            <p role="alert" className="p-6 text-sm text-red-700">
              {getApiErrorMessage(error)}
            </p>
          ) : data.data.length === 0 ? (
            <p className="p-6 text-sm text-gray-500">Belum ada anggota.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Nama</th>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Role</th>
                    {isAdmin && <th className="px-6 py-3 font-medium">Aksi</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.data.map((member) => (
                    <MemberRow
                      key={member.id}
                      businessId={businessId}
                      member={member}
                      isAdmin={isAdmin}
                      isSelf={member.id === me?.id}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Sebelumnya
          </Button>
          <span className="text-sm text-gray-500">
            Halaman {data.pagination.currentPage} dari {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Berikutnya
          </Button>
        </div>
      )}

      {isAdmin && (
        <AddMemberDialog open={addOpen} onOpenChange={setAddOpen} businessId={businessId} />
      )}
    </div>
  );
}

interface MemberRowProps {
  businessId: string;
  member: BusinessMember;
  isAdmin: boolean;
  isSelf: boolean;
}

function MemberRow({ businessId, member, isAdmin, isSelf }: MemberRowProps) {
  const updateRole = useUpdateMemberRole(businessId);
  const removeMember = useRemoveMember(businessId);
  const [rowError, setRowError] = useState<string | null>(null);

  const handleRoleChange = async (role: BusinessRole) => {
    setRowError(null);
    try {
      await updateRole.mutateAsync({ userId: member.id, role });
    } catch (err) {
      setRowError(getApiErrorMessage(err));
    }
  };

  const handleRemove = async () => {
    if (!window.confirm(`Lepaskan ${member.name} dari bisnis ini?`)) return;
    setRowError(null);
    try {
      await removeMember.mutateAsync(member.id);
    } catch (err) {
      setRowError(getApiErrorMessage(err));
    }
  };

  return (
    <tr>
      <td className="px-6 py-3 font-medium text-gray-900">{member.name}</td>
      <td className="px-6 py-3 text-gray-600">{member.email}</td>
      <td className="px-6 py-3">
        {isAdmin ? (
          <select
            className="h-8 rounded-md border border-gray-300 px-2 text-sm text-gray-900"
            value={member.role}
            disabled={updateRole.isPending}
            onChange={(e) => void handleRoleChange(e.target.value as BusinessRole)}
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        ) : (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {ROLE_LABEL[member.role]}
          </span>
        )}
        {rowError && <p className="mt-1 text-xs text-red-600">{rowError}</p>}
      </td>
      {isAdmin && (
        <td className="px-6 py-3">
          <Button
            variant="destructive"
            size="sm"
            disabled={isSelf || removeMember.isPending}
            title={isSelf ? "Tidak bisa mengeluarkan diri sendiri dari bisnis ini." : undefined}
            onClick={() => void handleRemove()}
          >
            Hapus
          </Button>
        </td>
      )}
    </tr>
  );
}

const nameSchema = z.string().min(1, "Nama wajib diisi.");
const emailSchema = z.string().email("Email tidak valid.");
const passwordSchema = z.string().min(8, "Password minimal 8 karakter.");

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
}

// Backend hanya punya "buat akun" + "hubungkan ke bisnis" terpisah (UserRoutes.ts),
// jadi dialog ini merangkai keduanya jadi satu aksi "Tambah Anggota".
function AddMemberDialog({ open, onOpenChange, businessId }: AddMemberDialogProps) {
  const addMember = useAddMember(businessId);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "viewer" as BusinessRole,
    } satisfies AddMemberInput,
    onSubmit: async ({ value, formApi }) => {
      setServerError(null);
      try {
        await addMember.mutateAsync(value);
        formApi.reset();
        onOpenChange(false);
      } catch (err) {
        setServerError(getApiErrorMessage(err));
      }
    },
  });

  const close = () => {
    onOpenChange(false);
    setServerError(null);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent onClose={close}>
        <DialogHeader>
          <DialogTitle>Tambah Anggota</DialogTitle>
          <DialogDescription>
            Buat akun baru dan hubungkan langsung ke bisnis ini.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name" validators={{ onChange: zodFieldValidator(nameSchema) }}>
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                  Nama
                </label>
                <Input
                  id={field.name}
                  name={field.name}
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

          <form.Field name="email" validators={{ onChange: zodFieldValidator(emailSchema) }}>
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                  Email
                </label>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  autoComplete="email"
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
            name="password"
            validators={{ onChange: zodFieldValidator(passwordSchema) }}
          >
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                  Password Awal
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

          <form.Field name="role">
            {(field) => (
              <div className="flex flex-col gap-1">
                <label htmlFor={field.name} className="text-sm font-medium text-gray-700">
                  Role
                </label>
                <select
                  id={field.name}
                  name={field.name}
                  className="h-9 rounded-md border border-gray-300 px-3 text-sm text-gray-900"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value as BusinessRole)}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </select>
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
                  {isSubmitting ? "Menyimpan..." : "Tambah"}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
