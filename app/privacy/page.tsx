import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";
import { LEGAL, SITE } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: `What ${SITE.name} stores, who can see it, and how to get it out or deleted.`,
};

/**
 * Written from what the code actually does — keep it that way. If a change
 * stores something new, shares something new, or changes how long anything is
 * kept, update this page (and LEGAL.updated) in the same change.
 *
 * Sources: players/allocations (0001), profiles (0016), guest purge (0019/0024),
 * export/delete (0020), login throttle (0022), @vercel/analytics in the root
 * layout, and the localStorage keys the client uses.
 */
export default function PrivacyPage() {
  const mail = <a href={`mailto:${SITE.email}`}>{SITE.email}</a>;

  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy policy"
      updated={LEGAL.updated}
      intro={
        <>
          <p>
            {SITE.name} is a classroom simulation. It is built to need as little about you as
            possible: a student can play with nothing but a name typed into a box.
          </p>
          <p className="text-base text-ink-muted">
            It is run by {LEGAL.operator}, an individual based in {LEGAL.location} (&ldquo;I&rdquo;
            below). Questions about this policy go to {mail}.
          </p>
        </>
      }
    >
      <LegalSection title="What is collected">
        <p>
          <strong>When you join a game as a student,</strong> without an account:
        </p>
        <ul>
          <li>the display name you type (shown on the leaderboard);</li>
          <li>
            a random guest ID, created in your browser so the game knows which device is yours. It
            is not linked to your name, email or phone number;
          </li>
          <li>what you allocate each round and the results that follow.</li>
        </ul>
        <p>
          <strong>If you create an account</strong> (to host games, or to keep your results as a
          student):
        </p>
        <ul>
          <li>your username, email address, display name and, if you add it, your institution;</li>
          <li>
            if you sign in with Google, the name and email address Google shares for sign-in;
          </li>
          <li>
            a password, if you set one. It is stored hashed by the sign-in provider and never
            visible to me.
          </li>
        </ul>
        <p>
          <strong>If you host,</strong> the sessions you create: their settings, their names, and
          the results of the students in them.
        </p>
        <p>
          <strong>Technical data.</strong> Page visits are counted with Vercel Web Analytics, which
          records the page, referrer, browser and device type and country, in aggregate and without
          cookies. To slow down password guessing, failed sign-in attempts are counted against the
          username and a one-way hash of the IP address, for a short window. The hosting providers
          keep standard server logs.
        </p>
      </LegalSection>

      <LegalSection title="How it is used">
        <p>
          Only to run the game: to show each round&apos;s results, build the standings, let you sign
          in, stop abuse, and fix what breaks. Nothing is sold, there are no ads, and there is no
          marketing email.
        </p>
      </LegalSection>

      <LegalSection title="Who can see what">
        <ul>
          <li>
            <strong>The host of a game</strong> sees each player&apos;s display name, what they
            allocated each round and their results, and can download them as a spreadsheet.
          </li>
          <li>
            <strong>Other players</strong> see display names and, when the host shows them, the
            standings (wealth and rank). They never see what another student allocated.
          </li>
          <li>
            <strong>Service providers</strong> process data on my behalf: Supabase (database and
            sign-in), Vercel (hosting and analytics), and Google, only if you choose Google sign-in.
          </li>
          <li>
            <strong>Anyone else</strong> only if the law requires it.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cookies and local storage">
        <p>
          The site uses only what it needs to work: a sign-in cookie that keeps you signed in, and
          your browser&apos;s local storage for small preferences, such as the name you last joined
          with or a chart setting. There are no advertising or tracking cookies, which is why there
          is no cookie banner.
        </p>
      </LegalSection>

      <LegalSection title="How long it is kept">
        <ul>
          <li>
            Game results stay with their session until the host deletes it or deletes their
            account.
          </li>
          <li>
            A guest ID with no activity for {LEGAL.guestRetentionDays} days may be removed. The
            results it played stay in the host&apos;s session, with no link back to that guest.
          </li>
          <li>An account is kept until you delete it.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Getting your data out, or deleted">
        <p>
          With an account, you can do both yourself on{" "}
          <Link href="/account">your account page</Link>: <strong>Download everything</strong> gives
          you a file of your profile, the sessions you hosted and every round you played, and{" "}
          <strong>Delete account</strong> removes the account. Deleting a host account also deletes
          the sessions it hosted.
        </p>
        <p>
          As a guest, ask the host to delete the session, or email {mail} with the game code and
          your display name. I answer requests within 30 days.
        </p>
      </LegalSection>

      <LegalSection title="Students and schools">
        <p>
          {SITE.name} is made for university classrooms and is not directed at children under 13,
          who should not use it. When an instructor runs it with a class, the instructor and their
          institution decide how it is used, and I handle the class&apos;s results on their
          behalf. Students don&apos;t need to use their real names; a first name or a nickname
          works just as well.
        </p>
      </LegalSection>

      <LegalSection title="Security and location">
        <p>
          Everything travels over HTTPS, and the database only lets each person reach their own
          records and the games they are part of. No system is perfectly secure, so please
          don&apos;t put anything sensitive in a display name or session name. Data is stored with
          Supabase and Vercel and may be processed in the United States or other countries where
          they operate.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If this policy changes, the date at the top changes with it, and a significant change
          will be noted on the site.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          {LEGAL.operator}, {LEGAL.location} — {mail}
        </p>
      </LegalSection>
    </LegalPage>
  );
}
