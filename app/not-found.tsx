import type { Metadata } from "next";
import { StatusPage } from "@/components/StatusPage";

export const metadata: Metadata = { title: "Page not found" };

/** Any URL that matches no route: a typo, an old link, a half-copied join link. */
export default function NotFound() {
  return (
    <StatusPage
      eyebrow="404"
      title="Page not found"
      body="That link doesn't lead anywhere. If you were joining a class, enter the code on the join page instead."
      primary={{ label: "Join a game", href: "/join" }}
      secondary={[
        { label: "Home", href: "/" },
        { label: "Host dashboard", href: "/host" },
      ]}
    />
  );
}
