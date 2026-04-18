export default function FooterSection() {
  return (
    <footer className="border-t border-black/5 bg-[#fff9ef]">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-8 py-16 md:grid-cols-12">
        <div className="space-y-5 md:col-span-5">
          <div className="flex items-center gap-2">
            <span className="text-2xl text-primary">✦</span>
            <div className="text-2xl font-bold text-[#1f1c18]">Velora AI</div>
          </div>

          <p className="max-w-sm leading-relaxed text-[#635f53]">
            The WhatsApp AI receptionist built to help clinics convert more conversations into confirmed appointments.
          </p>

          <p className="text-sm text-[#635f53]/60">
            © 2025 Velora AI. All rights reserved.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 md:col-span-7 md:grid-cols-3">
          <div className="space-y-4">
            <h5 className="text-sm font-bold uppercase tracking-[0.18em] text-[#635f53]/50">
              Product
            </h5>
            <ul className="space-y-3 text-sm font-medium text-[#1f1c18]">
              <li><a href="#how-it-works">How it works</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#final-cta">Book a Demo</a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h5 className="text-sm font-bold uppercase tracking-[0.18em] text-[#635f53]/50">
              Company
            </h5>
            <ul className="space-y-3 text-sm font-medium text-[#1f1c18]">
              <li><a href="#final-cta">Contact</a></li>
              <li><a href="#final-cta">Support</a></li>
              <li><a href="#final-cta">Demo</a></li>
            </ul>
          </div>

          <div className="space-y-4">
            <h5 className="text-sm font-bold uppercase tracking-[0.18em] text-[#635f53]/50">
              Legal
            </h5>
            <ul className="space-y-3 text-sm font-medium text-[#1f1c18]">
              <li><a href="#">Privacy</a></li>
              <li><a href="#">Terms</a></li>
              <li><a href="#">Cookies</a></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}