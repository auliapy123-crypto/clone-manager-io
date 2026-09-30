import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  /** Halaman sekarang (1-based). */
  page: number;
  /** Jumlah halaman total (dari response pagination backend). */
  totalPages: number;
  /** Dipanggil dengan nomor halaman baru saat user pindah halaman. */
  onPageChange: (page: number) => void;
  className?: string;
}

type PageItem = number | "ellipsis-left" | "ellipsis-right";

/**
 * Susun daftar tombol halaman. Pola umum biar nggak kepanjangan:
 * - <= 7 halaman  : semua angka tampil.
 * - dekat awal    : 1 2 3 4 5 ... 20
 * - dekat akhir   : 1 ... 16 17 18 19 20
 * - di tengah     : 1 ... 5 [6] 7 ... 20
 */
function getPageItems(current: number, total: number): PageItem[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-right", total];
  }
  if (current >= total - 3) {
    return [1, "ellipsis-left", total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, "ellipsis-left", current - 1, current, current + 1, "ellipsis-right", total];
}

/**
 * Pagination bernomor bersama (Guide: daftar paginated). Menggantikan
 * pola tombol Sebelumnya/Berikutnya + teks "Halaman X dari Y" yang
 * sebelumnya diduplikasi di tiap halaman list. Sendirian merender null
 * kalau datanya cuma 1 halaman, jadi parent tidak perlu guard sendiri.
 */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const items = getPageItems(page, totalPages);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-x-2 gap-y-2",
        className,
      )}
    >
      <span className="hidden text-sm text-gray-500 sm:block">
        Halaman {page} dari {totalPages}
      </span>
      <nav aria-label="Navigasi halaman" className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="Sebelumnya"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {items.map((item) =>
          typeof item === "number" ? (
            <Button
              key={item}
              variant={item === page ? "default" : "outline"}
              size="icon"
              aria-label={`Halaman ${item}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ) : (
            <span
              key={item}
              aria-hidden="true"
              className="flex h-9 w-9 items-center justify-center text-sm text-gray-500"
            >
              …
            </span>
          ),
        )}

        <Button
          variant="outline"
          size="icon"
          aria-label="Berikutnya"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </nav>
    </div>
  );
}
