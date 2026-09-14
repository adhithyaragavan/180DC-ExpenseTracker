import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { CategoriesClient } from "./CategoriesClient";

export default async function CategoriesPage() {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  return <CategoriesClient />;
}
