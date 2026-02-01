export interface Court {
  id: number;
  name: string;
  type: string; // Surface type e.g. 'Rubber', 'Grass', 'Hard'
  sport: 'Badminton' | 'Futsal' | 'Pickleball'; // New field
  pricePerHour: number;
  isAvailable: boolean;
}

export interface TimeSlot {
  id: string;
  time: string; // "20:00"
  label: string; // "8:00 PM"
  hour: number; // Raw hour for calculation
  isBooked: boolean;
}

export interface BookingDetails {
  courtId: number | null;
  date: Date;
  selectedSlots: string[]; // array of TimeSlot ids
  duration: number; // Duration in hours (1, 2, 3)
  totalPrice: number;
  // New user details
  userName: string;
  userEmail: string;
  userPhone: string;
  // Timeout logic
  bookingExpiry: number | null; // Timestamp when booking expires
}

// Interface for fetching booking list in Admin
export interface BookingRecord {
  id: number;
  courtId: number;
  date: string;
  timeSlotId: string;
  userName: string;
  userPhone: string;
  totalPrice: number;
  billCode: string;
  timestamp: string;
}

export enum BookingStep {
  SELECT_COURT = 1,
  SELECT_DATE_TIME = 2,
  SUMMARY = 3,
  SUCCESS = 4, // Updated sequence
}

export enum AppView {
  USER = 'USER',
  ADMIN_LOGIN = 'ADMIN_LOGIN',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD'
}

export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}