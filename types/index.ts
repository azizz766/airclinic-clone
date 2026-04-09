// Basic types for the application

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'clinic_owner' | 'doctor' | 'staff'
}

export interface Clinic {
  id: string
  name: string
  address: string
  phone: string
  email: string
}

export interface Doctor {
  id: string
  name: string
  specialty: string
  clinicId: string
}

export interface Service {
  id: string
  name: string
  duration: number // in minutes
  price: number
  clinicId: string
}

export interface Patient {
  id: string
  name: string
  email: string
  phone: string
  clinicId: string
}

export interface Appointment {
  id: string
  patientId: string
  doctorId: string
  serviceId: string
  date: Date
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled'
  clinicId: string
}

export interface Conversation {
  id: string
  patientId: string
  messages: Message[]
  clinicId: string
}

export interface Message {
  id: string
  content: string
  sender: 'patient' | 'clinic'
  timestamp: Date
}

export interface Reminder {
  id: string
  appointmentId: string
  type: 'email' | 'sms'
  scheduledAt: Date
  sent: boolean
}

export interface Campaign {
  id: string
  name: string
  description: string
  targetAudience: string
  clinicId: string
}