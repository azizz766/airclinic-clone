import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { type ClinicRole, normalizeClinicRole } from '@/lib/auth/permissions'

type ClinicPageAccess = {
	userId: string
	clinicId: string
	role: ClinicRole
}

export async function getClinicPageAccess(clinicId: string): Promise<ClinicPageAccess> {
	const supabase = await createClient()
	const {
		data: { session },
	} = await supabase.auth.getSession()

	if (!session) {
		redirect('/login')
	}

	const membership = await prisma.membership.findFirst({
		where: {
			userId: session.user.id,
			clinicId,
			isActive: true,
		},
		select: {
			clinicId: true,
			role: true,
		},
	})

	if (!membership) {
		redirect('/onboarding')
	}

	return {
		userId: session.user.id,
		clinicId: membership.clinicId,
		role: normalizeClinicRole(membership.role),
	}
}

export async function requireClinicPageAccess(
	clinicId: string,
	canAccess: (role: ClinicRole) => boolean,
	fallbackSegment = 'appointments'
) {
	const access = await getClinicPageAccess(clinicId)

	if (!canAccess(access.role)) {
		redirect(`/${clinicId}/${fallbackSegment}`)
	}

	return access
}