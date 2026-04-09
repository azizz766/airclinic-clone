'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import {
  type ClinicRole,
  canViewActivityLog,
  canViewDashboardMetrics,
  canViewInbox,
  canViewNotificationCenter,
} from '@/lib/auth/permissions'

type NavItem = {
  label: string
  segment: string
  iconPath: string
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    segment: 'dashboard',
    iconPath:
      'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  },
  {
    label: 'Appointments',
    segment: 'appointments',
    iconPath:
      'M8 7V3M16 7V3M7 11h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    label: 'Patients',
    segment: 'patients',
    iconPath:
      'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  },
  {
    label: 'Doctors',
    segment: 'doctors',
    iconPath:
      'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  },
  {
    label: 'Services',
    segment: 'services',
    iconPath:
      'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2M4 6h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z',
  },
  {
    label: 'Reminders',
    segment: 'reminders',
    iconPath:
      'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
  },
  {
    label: 'Inbox',
    segment: 'inbox',
    iconPath:
      'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z',
  },
  {
    label: 'Notifications',
    segment: 'notifications',
    iconPath:
      'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h11z',
  },
  {
    label: 'Activity',
    segment: 'activity',
    iconPath:
      'M4 6h16M4 12h16M4 18h10',
  },
  {
    label: 'Settings',
    segment: 'settings',
    iconPath:
      'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
]

type ClinicSidebarProps = {
  clinicId: string
  role: ClinicRole
}

export function ClinicSidebar({ clinicId, role }: ClinicSidebarProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = NAV_ITEMS.filter((item) => {
    if (item.segment === 'dashboard') return canViewDashboardMetrics(role)
    if (item.segment === 'notifications') return canViewNotificationCenter(role)
    if (item.segment === 'activity') return canViewActivityLog(role)
    if (item.segment === 'inbox') return canViewInbox(role)
    return true
  }).map((item) => ({
    ...item,
    href: `/${clinicId}/${item.segment}`,
    isActive: pathname.startsWith(`/${clinicId}/${item.segment}`),
  }))

  const sidebarInner = (
    <div className="relative flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0)_22%),linear-gradient(180deg,#0f172a_0%,#111827_100%)] shadow-[inset_-1px_0_0_rgba(255,255,255,0.04)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(139,92,246,0.22),transparent_62%)]" />
      <div className="relative flex h-20 items-center gap-3 px-6 shrink-0">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-500 shadow-[0_10px_30px_rgba(139,92,246,0.35),inset_0_1px_0_rgba(255,255,255,0.3)]">
          <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
        </div>
        <div>
          <span className="text-[15px] font-semibold tracking-tight text-white">AirClinic</span>
          <p className="mt-0.5 text-[11px] text-slate-500">Clinic operations</p>
        </div>
      </div>
      <div className="px-6 pb-4">
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{clinicId}</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-4 pb-8">
        <ul className="space-y-1.5">
          {navItems.map((item) => (
            <li key={item.segment}>
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'group flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-150',
                  item.isActive
                    ? 'bg-white/10 text-white shadow-[0_10px_30px_rgba(15,23,42,0.24),inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-white/10'
                    : 'text-slate-500 hover:-translate-y-px hover:bg-white/[0.05] hover:text-slate-200',
                )}
              >
                <span
                  className={cn(
                    'absolute left-2 h-8 w-1 rounded-full transition-all duration-150',
                    item.isActive ? 'bg-violet-400 shadow-[0_0_18px_rgba(167,139,250,0.45)]' : 'bg-transparent',
                  )}
                />
                <svg
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors duration-150',
                    item.isActive ? 'text-violet-300' : 'text-slate-600 group-hover:text-slate-300',
                  )}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.75}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
                </svg>
                <span className="relative">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )

  return (
    <>
      {/* Mobile: top bar with hamburger */}
      <div className="fixed top-0 left-0 right-0 z-30 flex h-14 items-center bg-slate-950 px-4 shadow-[0_1px_0_rgba(255,255,255,0.06)] md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-slate-400 transition-all duration-150 hover:-translate-y-px hover:bg-white/10 hover:text-slate-200"
          aria-label="Open menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>
        <span className="ml-3 text-base font-semibold text-white">AirClinic</span>
      </div>

      {/* Mobile: overlay sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute left-0 top-0 h-full w-60 bg-slate-950 shadow-[0_24px_64px_rgba(0,0,0,0.45)]">
            {sidebarInner}
          </div>
        </div>
      )}

      {/* Desktop: persistent sidebar */}
      <aside className="hidden h-full w-64 shrink-0 md:flex md:flex-col bg-slate-950">
        {sidebarInner}
      </aside>
    </>
  )
}
