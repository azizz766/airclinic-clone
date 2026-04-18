export default function TopNav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-black/5 bg-surface backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-5">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl text-primary">✦</span>
          <div className="text-2xl tracking-tight text-[#363228]">
            <span className="font-bold">Velora</span>
            <span className="font-extrabold text-[#9C89B8]"> AI</span>
          </div>
        </div>

        <div className="hidden items-center gap-10 md:flex">
  <a href="#how-it-works" className="font-bold transition hover:text-on-surface">
    How it works
  </a>

  <a href="#features" className="font-bold transition hover:text-on-surface">
    Features
  </a>

  <a href="#outcomes" className="font-bold transition hover:text-on-surface">
    Outcomes
  </a>

  <a href="#use-cases" className="font-bold transition hover:text-on-surface">
    Use Cases
  </a>

  <a href="#pricing" className="font-bold transition hover:text-on-surface">
    Pricing
  </a>
</div>

       <button style={{ backgroundColor: "#674db1" }} className="rounded-[1rem] px-4 py-2 text-lg font-bold text-white">
          Book a Demo
        </button>
      </div>
    </nav>
  )
}