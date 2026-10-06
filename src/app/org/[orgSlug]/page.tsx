import { redirect } from "next/navigation";

export default async function OrgIndex({ params }: PageProps<"/org/[orgSlug]">) {
  const { orgSlug } = await params;
  redirect(`/org/${orgSlug}/dashboard`);
}
