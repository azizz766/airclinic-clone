import TopNav from "@/components/velora/top-nav"
import HeroFull from "@/components/velora/hero-full"
import ProblemSection from "@/components/velora/problem-section"
import StatsSection from "@/components/velora/stats-section"
import PositioningSection from "@/components/velora/positioning-section"
import HowItWorksSection from "@/components/velora/how-it-works-section"
import FeaturesSection from "@/components/velora/features-section"
import SocialProofSection from "@/components/velora/social-proof-section"
import UseCasesSection from "@/components/velora/use-cases-section"
import PricingSection from "@/components/velora/pricing-section"
import FooterSection from "@/components/velora/footer-section"
import FinalCTASection from "@/components/velora/final-cta-section"

export default function VeloraNextPage() {
  return (
    <main className="min-h-screen bg-surface text-on-surface">
      <TopNav />
      <HeroFull />
      <ProblemSection />
      <StatsSection />
      <PositioningSection />
      <HowItWorksSection />
      <FeaturesSection />
      <SocialProofSection />
      <UseCasesSection />
      <PricingSection />
      <FinalCTASection />
      <FooterSection />
    </main>
  )
}