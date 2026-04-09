interface ConversationsPageProps {
  params: {
    clinicId: string
  }
}

export default function ConversationsPage({ params }: ConversationsPageProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Conversations - Clinic {params.clinicId}
          </h1>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Conversations inbox will be added here */}
        <p className="text-gray-600">Conversations page placeholder</p>
      </main>
    </div>
  )
}