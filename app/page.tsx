import { SiteHeader } from "@/components/marketing/SiteHeader";
import { Hero } from "@/components/marketing/Hero";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { GameModes } from "@/components/marketing/GameModes";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { BothSides } from "@/components/marketing/BothSides";
import { WhoItsFor } from "@/components/marketing/WhoItsFor";
import { Faq } from "@/components/marketing/Faq";
import { FinalCta } from "@/components/marketing/FinalCta";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { HomeResumeSlot } from "@/components/marketing/HomeResumeSlot";

/**
 * The public landing page. Still a static Server Component; the only client JS
 * is the scroll-reveal wrapper, the native FAQ disclosures, and the account menu
 * in the header and the resume strip above the hero — the two pieces that have
 * to know who is signed in, both loaded as async chunks. Every string lives in
 * `lib/marketing/content.ts`.
 */
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-dvh">
        {/* "Resume your class" / "Rejoin your game" — nothing for most visitors. */}
        <HomeResumeSlot />
        <Hero />
        <HowItWorks />
        <GameModes />
        <FeatureGrid />
        <BothSides />
        <WhoItsFor />
        {/* <Pricing /> is written and tested but parked while the numbers are
            unsettled. To bring it back: import it here, restore the Pricing
            entry in NAV_LINKS, and renumber the FAQ eyebrow to "07". */}
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
