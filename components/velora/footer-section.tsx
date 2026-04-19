'use client'

import Link from "next/link"
import { useState } from "react"

type ModalType =
  | 'privacy'
  | 'terms'
  | 'cookies'
  | 'contact'
  | 'support'
  | 'resources'
  | null

export default function FooterSection() {
  const [activeModal, setActiveModal] = useState<ModalType>(null)

  const closeModal = () => setActiveModal(null)

  const modalContent = {
    privacy: {
      title: 'Privacy Policy',
      content: (
        <div className="space-y-5 text-sm leading-7 text-[#635f53]">
          <p>
            Velora AI is committed to protecting your privacy and ensuring that your information is handled with transparency and care.
          </p>

          <div>
            <h3 className="font-bold text-[#2d2a26]">1. Information We Collect</h3>
            <p>
              We collect business-related information such as clinic name, contact name, work email, and interaction data when you engage with our platform or request a demo.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#2d2a26]">2. How We Use Information</h3>
            <p>
              Your information is used to communicate with you, deliver requested services, improve our product experience, and provide relevant follow-up.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#2d2a26]">3. Data Protection</h3>
            <p>
              We implement secure infrastructure and best practices to safeguard your information against unauthorized access, loss, or misuse.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#2d2a26]">4. Sharing of Information</h3>
            <p>
              We do not sell your data. Information may only be shared with trusted service providers required to operate and maintain the platform.
            </p>
          </div>
        </div>
      ),
    },

    terms: {
      title: 'Terms of Service',
      content: (
        <div className="space-y-5 text-sm leading-7 text-[#635f53]">
          <p>
            By accessing or using Velora AI, you agree to the following terms and conditions.
          </p>

          <div>
            <h3 className="font-bold text-[#2d2a26]">1. Acceptable Use</h3>
            <p>
              You agree to use the platform for lawful business purposes only and not engage in any activity that may disrupt or misuse the service.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#2d2a26]">2. Service Availability</h3>
            <p>
              Velora AI may update, modify, or discontinue features at any time without prior notice.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#2d2a26]">3. Intellectual Property</h3>
            <p>
              All platform content, branding, and technology remain the property of Velora AI and may not be reused without permission.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#2d2a26]">4. Limitation of Liability</h3>
            <p>
              The platform is provided on an as-is basis without guarantees of uninterrupted or error-free operation.
            </p>
          </div>
        </div>
      ),
    },

    cookies: {
      title: 'Cookies Policy',
      content: (
        <div className="space-y-5 text-sm leading-7 text-[#635f53]">
          <p>
            Velora AI uses cookies and similar technologies to enhance user experience and improve platform performance.
          </p>

          <div>
            <h3 className="font-bold text-[#2d2a26]">1. Purpose of Cookies</h3>
            <p>
              Cookies help us understand user behavior, optimize performance, and personalize interactions.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#2d2a26]">2. Types of Cookies</h3>
            <p>
              We may use essential cookies, analytics cookies, and performance-related cookies to support platform functionality.
            </p>
          </div>

          <div>
            <h3 className="font-bold text-[#2d2a26]">3. Managing Cookies</h3>
            <p>
              You can manage or disable cookies through your browser settings. Some features may be affected if cookies are disabled.
            </p>
          </div>
        </div>
      ),
    },

    contact: {
      title: 'Contact',
      content: (
        <div className="space-y-4 text-sm text-[#635f53]">
          <p>
            If you'd like to learn more about Velora AI or discuss how it can support your clinic, our team is ready to help.
          </p>
          <p className="font-semibold text-[#2d2a26]">
            hello@velora.ai
          </p>
        </div>
      ),
    },

    support: {
      title: 'Support',
      content: (
        <div className="space-y-4 text-sm text-[#635f53]">
          <p>
            Our support team is available to assist you with onboarding, setup, and ongoing optimization.
          </p>
          <p>
            We aim to respond quickly and ensure your experience with Velora AI runs smoothly.
          </p>
        </div>
      ),
    },

    resources: {
      title: 'Resources',
      content: (
        <div className="space-y-4 text-sm text-[#635f53]">
          <p>
            Explore how Velora AI helps clinics automate communication and improve efficiency.
          </p>

          <ul className="space-y-2">
            <li>• Getting Started Guide</li>
            <li>• Best Practices for Clinics</li>
            <li>• AI Automation Workflows</li>
          </ul>
        </div>
      ),
    },
  }

  return (
    <>
      <footer className="border-t border-white/10 bg-[#1f1c18]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-8 py-16 md:grid-cols-12">
          <div className="space-y-5 md:col-span-5">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✦</span>
              <div className="text-2xl font-bold text-[#EDE6DB]">Velora AI</div>
            </div>

            <p className="max-w-sm text-[#EDE6DB]">
              The WhatsApp AI receptionist built to help clinics convert conversations into confirmed appointments.
            </p>

            <p className="text-sm text-[#EDE6DB]/60">
              © 2025 Velora AI. All rights reserved.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:col-span-7 md:grid-cols-3">
            <div>
              <h5 className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[#EDE6DB]/80">
                Product
              </h5>
              <ul className="space-y-3 text-sm text-[#EDE6DB]/60">
                <li><a href="/#how-it-works">How it works</a></li>
                <li><a href="/#pricing">Pricing</a></li>
                <li><Link href="/book-demo">Book a Demo</Link></li>
              </ul>
            </div>

            <div>
              <h5 className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[#EDE6DB]/80">
                Company
              </h5>
              <ul className="space-y-3 text-sm text-[#EDE6DB]/60">
                <li><button onClick={() => setActiveModal('contact')}>Contact</button></li>
                <li><button onClick={() => setActiveModal('support')}>Support</button></li>
                <li><button onClick={() => setActiveModal('resources')}>Resources</button></li>
              </ul>
            </div>

            <div>
              <h5 className="mb-4 text-sm font-bold uppercase tracking-[0.18em] text-[#EDE6DB]/80">
                Legal
              </h5>
              <ul className="space-y-3 text-sm text-[#EDE6DB]/60">
                <li><button onClick={() => setActiveModal('privacy')}>Privacy</button></li>
                <li><button onClick={() => setActiveModal('terms')}>Terms</button></li>
                <li><button onClick={() => setActiveModal('cookies')}>Cookies</button></li>
              </ul>
            </div>
          </div>
        </div>
      </footer>

      {activeModal && (
        <div
          className="fixed inset-0 !z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
          onClick={closeModal}
        >
          <div
            className="relative !z-[100000] w-full max-w-lg rounded-[2.5rem] bg-[#F8F3EA] p-10 shadow-[0_40px_120px_rgba(0,0,0,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              className="absolute right-5 top-5 text-xl text-[#8f8778] hover:text-black"
            >
              ×
            </button>

            <h2 className="mb-6 text-2xl font-bold text-[#2d2a26]">
              {modalContent[activeModal].title}
            </h2>

            <div className="max-h-[60vh] overflow-y-auto">
              {modalContent[activeModal].content}
            </div>
          </div>
        </div>
      )}
    </>
  )
}