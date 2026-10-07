"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Diary" },
  { href: "/progress", label: "Progress" },
  { href: "/settings", label: "Settings" },
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <ul className="mx-auto flex max-w-xl">
        {LINKS.map((l) => (
          <li key={l.href} className="flex-1">
            <Link
              href={l.href}
              className={`block py-3 text-center text-sm font-medium ${path === l.href ? "text-emerald-600" : "text-zinc-500"}`}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
