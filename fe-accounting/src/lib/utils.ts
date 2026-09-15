/** Gabungkan class Tailwind, membuang value falsy (Guide §3 -- dipakai components/ui). */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
