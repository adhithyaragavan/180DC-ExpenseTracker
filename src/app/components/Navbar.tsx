"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/categories", label: "Categories" },
  { href: "/budgets", label: "Budgets" },
];

export function Navbar() {
  return (
    <nav className="flex items-center justify-between border-b px-6 py-3">
      <div className="flex gap-4 text-sm">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:underline">
            {link.label}
          </Link>
        ))}
      </div>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-50"
      >
        Logout
      </button>
    </nav>
  );
}
