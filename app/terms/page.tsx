import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/marketing/LegalPage";
import { LEGAL, SITE } from "@/lib/marketing/content";

export const metadata: Metadata = {
  title: "Terms of use",
  description: `The terms for using ${SITE.name}.`,
};

export default function TermsPage() {
  const mail = <a href={`mailto:${SITE.email}`}>{SITE.email}</a>;

  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of use"
      updated={LEGAL.updated}
      intro={
        <>
          <p>
            These terms cover using {SITE.name}, run by {LEGAL.operator} (&ldquo;I&rdquo; below).
            By using the site — hosting a game, joining one, or creating an account — you agree to
            them.
          </p>
          <p className="text-base text-ink-muted">
            How your data is handled is in the <Link href="/privacy">Privacy policy</Link>.
          </p>
        </>
      }
    >
      <LegalSection title="The service">
        <p>
          {SITE.name} is free to use during the pilot. Features may change, and the site may
          occasionally be unavailable. If it ever stops being free or shuts down, I will say so on
          the site in advance wherever I can.
        </p>
      </LegalSection>

      <LegalSection title="A simulation, not financial advice">
        <p>
          No real money is involved. Every market, return and manager in the games is simulated
          for teaching, and nothing on the site is investment, financial or tax advice.
        </p>
      </LegalSection>

      <LegalSection title="Accounts">
        <ul>
          <li>Keep your password to yourself; you are responsible for what happens on your account.</li>
          <li>One person per account, and the details you give should be accurate.</li>
          <li>You can delete your account at any time from your account page.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Playing fair">
        <p>Please don&apos;t:</p>
        <ul>
          <li>use a display name or session name that is offensive, or that pretends to be someone else;</li>
          <li>disrupt a game, or join one you weren&apos;t invited to;</li>
          <li>
            try to reach other people&apos;s data, get around the site&apos;s security, or flood it
            with automated traffic.
          </li>
        </ul>
        <p>I may remove a player, a session or an account that does these things.</p>
      </LegalSection>

      <LegalSection title="If you host with a class">
        <p>
          You are responsible for how you use {SITE.name} with your students, including following
          your institution&apos;s policies. Don&apos;t put sensitive information in session names,
          and let students know they can play under a first name or nickname.
        </p>
      </LegalSection>

      <LegalSection title="Your content">
        <p>
          The names you enter — display names and session names — stay yours. You give me
          permission to store and show them only as needed to run the game.
        </p>
        <p>The site itself, its design and its code belong to {LEGAL.operator}.</p>
      </LegalSection>

      <LegalSection title="No warranty">
        <p>
          The site is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
          warranties of any kind, express or implied — including that it will be uninterrupted,
          error-free, or fit for a particular purpose.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the fullest extent the law allows, I am not liable for any indirect, incidental or
          consequential loss arising from your use of the site, and my total liability for any
          claim is limited to the greater of the amount you paid to use the site in the previous
          twelve months or US$50.
        </p>
      </LegalSection>

      <LegalSection title="Governing law">
        <p>
          These terms are governed by the laws of {LEGAL.governingLaw}, without regard to its
          conflict-of-law rules, and any dispute belongs in the courts located in Massachusetts.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          If these terms change, the date at the top changes with them. Continuing to use the site
          after a change means you accept the new terms.
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
