import React, { useState, useEffect, useMemo } from 'react';
import { BookingDetails, BookingStep, Court, TimeSlot } from './types';
import CourtCard from './components/CourtCard';
import ToyyibPaySimulator from './components/ToyyibPaySimulator';
import ChatBot from './components/ChatBot';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  ChevronRight, 
  ChevronLeft, 
  CheckCircle,
  AlertTriangle,
  User,
  Mail,
  Phone,
  Timer,
  Hourglass,
  CalendarDays
} from 'lucide-react';

// Mock Data
const MOCK_COURTS: Court[] = [
  { id: 1, name: "Court Dato' Lee", type: 'Rubber', pricePerHour: 20, isAvailable: true },
  { id: 2, name: "Court Misbun", type: 'Rubber', pricePerHour: 20, isAvailable: true },
  { id: 3, name: "Court Sidek", type: 'Parquet', pricePerHour: 15, isAvailable: true },
  { id: 4, name: "Court Zii Jia", type: 'Parquet', pricePerHour: 15, isAvailable: false },
];

const START_HOUR = 8; // 8 AM
const END_HOUR = 23; // 11 PM
const BOOKING_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minutes

const App: React.FC = () => {
  const [step, setStep] = useState<BookingStep>(BookingStep.SELECT_COURT);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  
  const [details, setDetails] = useState<BookingDetails>({
    courtId: null,
    date: new Date(),
    selectedSlots: [],
    duration: 1, // Default 1 hour
    totalPrice: 0,
    userName: '',
    userEmail: '',
    userPhone: '',
    bookingExpiry: null
  });

  // Derived state for selected court
  const selectedCourt = useMemo(() => 
    MOCK_COURTS.find(c => c.id === details.courtId), 
  [details.courtId]);

  // Generate Slots based on date (Mock Availability)
  const generateTimeSlots = (date: Date): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const dayOfMonth = date.getDate(); // Use day of month to vary availability
    
    for (let i = START_HOUR; i <= END_HOUR; i++) {
      const timeStr = `${i}:00`;
      const label = i > 12 ? `${i - 12} PM` : `${i} AM`;
      
      // Better pseudo-randomness based on Day + Hour
      // This ensures different days have different patterns
      const isBooked = ((dayOfMonth + i) % 5 === 0) || ((dayOfMonth * i) % 13 === 0); 

      slots.push({
        id: `${date.toISOString().split('T')[0]}-${i}`,
        time: timeStr,
        label,
        hour: i,
        isBooked
      });
    }
    return slots;
  };

  const [availableSlots, setAvailableSlots] = useState<TimeSlot[]>([]);

  useEffect(() => {
    setAvailableSlots(generateTimeSlots(details.date));
  }, [details.date]);

  // --- Timeout Logic ---
  useEffect(() => {
    let interval: any;

    if ((step === BookingStep.SUMMARY || step === BookingStep.PAYMENT_GATEWAY) && details.bookingExpiry) {
      interval = setInterval(() => {
        const remaining = details.bookingExpiry! - Date.now();
        if (remaining <= 0) {
          alert("Masa pembayaran tamat (15 Minit). Sila buat tempahan semula.");
          resetBooking();
        } else {
          setTimeLeft(remaining);
        }
      }, 1000);
    } else {
      setTimeLeft(null);
    }

    return () => clearInterval(interval);
  }, [step, details.bookingExpiry]);

  // Format MM:SS
  const formatTimeLeft = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Helper to format Date for Input value (YYYY-MM-DD)
  const getFormattedDateValue = (date: Date) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };


  // --- Handlers ---

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    
    // Create Date from YYYY-MM-DD string treating it as Local Time
    const [year, month, day] = e.target.value.split('-').map(Number);
    // Note: Month is 0-indexed in JS Date constructor
    const newDate = new Date(year, month - 1, day);
    
    setDetails(prev => ({ ...prev, date: newDate, selectedSlots: [] }));
  };

  const handleDurationSelect = (hours: number) => {
    setDetails(prev => ({ ...prev, duration: hours, selectedSlots: [], totalPrice: 0 }));
  };

  const handleSlotSelect = (startSlot: TimeSlot) => {
    if (startSlot.isBooked) return;

    // Check if subsequent slots are available for the duration
    const slotsToBook: string[] = [];
    let isValid = true;

    for (let i = 0; i < details.duration; i++) {
        const targetHour = startSlot.hour + i;
        if (targetHour > END_HOUR) {
            isValid = false; // Exceeds operating hours
            break;
        }
        
        const targetSlot = availableSlots.find(s => s.hour === targetHour);
        if (!targetSlot || targetSlot.isBooked) {
            isValid = false;
            break;
        }
        slotsToBook.push(targetSlot.id);
    }

    if (isValid && selectedCourt) {
        setDetails(prev => ({
            ...prev,
            selectedSlots: slotsToBook,
            totalPrice: selectedCourt.pricePerHour * prev.duration
        }));
    } else {
        alert(`Slot tidak mencukupi untuk tempahan ${details.duration} jam.`);
    }
  };

  const handleNext = () => {
    if (step === BookingStep.SELECT_COURT && details.courtId) {
      setStep(BookingStep.SELECT_DATE_TIME);
    } else if (step === BookingStep.SELECT_DATE_TIME && details.selectedSlots.length > 0) {
      // Start the timer when moving to summary
      setDetails(prev => ({ ...prev, bookingExpiry: Date.now() + BOOKING_TIMEOUT_MS }));
      setStep(BookingStep.SUMMARY);
    } else if (step === BookingStep.SUMMARY) {
      setStep(BookingStep.PAYMENT_GATEWAY);
    }
  };

  const handleBack = () => {
    if (step === BookingStep.SUMMARY) {
        // Clear timer if going back to edit
        setDetails(prev => ({ ...prev, bookingExpiry: null }));
    }
    if (step > 1) setStep(step - 1);
  };

  const handlePaymentSuccess = () => {
    setDetails(prev => ({ ...prev, bookingExpiry: null })); // Stop timer
    setStep(BookingStep.SUCCESS);
  };

  const resetBooking = () => {
    setDetails({
        courtId: null,
        date: new Date(),
        selectedSlots: [],
        duration: 1,
        totalPrice: 0,
        userName: '',
        userEmail: '',
        userPhone: '',
        bookingExpiry: null
    });
    setStep(BookingStep.SELECT_COURT);
    setTimeLeft(null);
  };

  // --- Main View Logic ---

  if (step === BookingStep.PAYMENT_GATEWAY) {
    return (
      <>
        {timeLeft !== null && (
            <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-center py-2 z-[60] text-sm font-bold flex justify-center items-center gap-2">
                <Timer className="w-4 h-4" />
                Masa Pembayaran: {formatTimeLeft(timeLeft)}
            </div>
        )}
        <ToyyibPaySimulator 
            amount={details.totalPrice} 
            onSuccess={handlePaymentSuccess} 
            onCancel={() => setStep(BookingStep.SUMMARY)} 
        />
      </>
    );
  }

  if (step === BookingStep.SUCCESS) {
      return (
          <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Tempahan Berjaya!</h1>
              <p className="text-gray-500 mb-8">
                Terima kasih, <span className="font-semibold text-gray-800">{details.userName}</span>. 
                Resit telah dihantar ke <span className="font-semibold">{details.userEmail}</span>.
              </p>
              
              <div className="bg-gray-50 p-6 rounded-xl w-full max-w-sm mb-8 text-left border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">ID Tempahan</p>
                  <p className="font-mono font-bold text-gray-800 mb-4">#INV-{Math.floor(Math.random() * 100000)}</p>
                  
                  <p className="text-xs text-gray-400 mb-1">Court</p>
                  <p className="font-semibold text-gray-800 mb-4">{selectedCourt?.name}</p>

                  <p className="text-xs text-gray-400 mb-1">Tarikh & Masa</p>
                  <p className="font-semibold text-gray-800 mb-4">
                      {details.date.toLocaleDateString('ms-MY', { day: 'numeric', month: 'long' })}
                      <br/>
                      {details.selectedSlots.length} Slot ({details.selectedSlots.length} Jam)
                  </p>
              </div>

              <button 
                onClick={resetBooking}
                className="w-full max-w-xs bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition"
              >
                  Tempah Lagi
              </button>
          </div>
      )
  }

  return (
    <div className="min-h-screen pb-20 max-w-md mx-auto bg-gray-50 shadow-2xl relative overflow-hidden">
        
      {/* Header */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[2rem] shadow-lg relative z-10">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight">CourtMas 🏸</h1>
            <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
                <User className="w-5 h-5" />
            </div>
        </div>
        
        {/* Progress Bar */}
        <div className="flex justify-between px-4 relative">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-emerald-800/50 -z-10 transform -translate-y-1/2"></div>
            {[1, 2, 3].map((s) => (
                <div 
                    key={s}
                    className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                        ${step >= s ? 'bg-white text-emerald-600 scale-110 shadow-md' : 'bg-emerald-800 text-emerald-400'}
                    `}
                >
                    {s}
                </div>
            ))}
        </div>
        <div className="text-center mt-2 text-emerald-100 text-sm font-medium">
            {step === 1 && "Pilih Gelanggang"}
            {step === 2 && "Pilih Masa"}
            {step === 3 && "Semakan & Bayar"}
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 -mt-6 relative z-20">

        {/* Global Timer Alert for Summary Step */}
        {timeLeft !== null && step === BookingStep.SUMMARY && (
             <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center justify-between shadow-sm animate-pulse">
                <div className="flex items-center gap-2">
                    <Hourglass className="w-5 h-5" />
                    <span className="font-bold text-sm">Selesaikan dalam 15 minit</span>
                </div>
                <span className="font-mono font-bold text-lg">{formatTimeLeft(timeLeft)}</span>
             </div>
        )}
        
        {/* Step 1: Court Selection */}
        {step === BookingStep.SELECT_COURT && (
          <div className="space-y-4 animate-fade-in-up">
            <h2 className="font-bold text-gray-800 text-lg mb-2">Senarai Gelanggang</h2>
            <div className="grid gap-4">
              {MOCK_COURTS.map(court => (
                <CourtCard 
                    key={court.id} 
                    court={court} 
                    isSelected={details.courtId === court.id}
                    onSelect={(id) => setDetails(prev => ({ ...prev, courtId: id, selectedSlots: [], totalPrice: 0 }))}
                />
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Date & Time */}
        {step === BookingStep.SELECT_DATE_TIME && (
          <div className="space-y-6 animate-fade-in-up">
            <div>
                <h2 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-emerald-600" /> 
                    Tarikh Pilihan
                </h2>
                
                {/* Native Calendar Input UI (Overlay Strategy) */}
                <div className="relative w-full group">
                    {/* Visual Card (Background) */}
                    <div className="bg-white border-2 border-gray-100 group-hover:border-emerald-400 p-4 rounded-xl flex items-center justify-between shadow-sm transition-colors pointer-events-none">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                <CalendarDays className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-0.5">Tarikh Main</p>
                                <p className="font-bold text-gray-800 text-lg group-hover:text-emerald-700 transition-colors">
                                    {details.date.toLocaleDateString('ms-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                        </div>
                        <div className="text-emerald-600 font-bold text-sm bg-emerald-50 px-3 py-1.5 rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition">
                            Tukar
                        </div>
                    </div>

                    {/* Actual Input (Invisible Overlay) */}
                    <input
                        type="date"
                        min={getFormattedDateValue(new Date())}
                        value={getFormattedDateValue(details.date)}
                        onChange={handleDateChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                </div>
            </div>

            {/* Duration Selector */}
            <div>
                <h2 className="font-bold text-gray-800 text-lg mb-3 flex items-center gap-2">
                    <Hourglass className="w-5 h-5 text-emerald-600" />
                    Tempoh Main
                </h2>
                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-6 px-6">
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                        <button
                            key={h}
                            onClick={() => handleDurationSelect(h)}
                            className={`
                                min-w-[80px] py-3 rounded-lg font-bold border transition-all flex-shrink-0
                                ${details.duration === h 
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' 
                                    : 'bg-white text-gray-600 border-gray-200'}
                            `}
                        >
                            {h} Jam
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <h2 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-emerald-600" /> 
                    Pilih Waktu Mula
                </h2>
                <div className="grid grid-cols-3 gap-3">
                    {availableSlots.map(slot => {
                        const isSelected = details.selectedSlots.includes(slot.id);
                        
                        // Check availability for block booking visual logic
                        let isBlockAvailable = true;
                        if (!slot.isBooked) {
                             for (let i = 0; i < details.duration; i++) {
                                const target = availableSlots.find(s => s.hour === slot.hour + i);
                                if (!target || target.isBooked) isBlockAvailable = false;
                             }
                             if (slot.hour + details.duration - 1 > END_HOUR) isBlockAvailable = false;
                        }

                        const isDisabled = slot.isBooked || !isBlockAvailable;

                        return (
                            <button
                                key={slot.id}
                                disabled={isDisabled}
                                onClick={() => handleSlotSelect(slot)}
                                className={`
                                    py-3 px-2 rounded-lg text-sm font-medium border transition-all relative
                                    ${slot.isBooked 
                                        ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed' 
                                        : isSelected
                                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md transform scale-105 z-10'
                                            : isDisabled 
                                                ? 'bg-white text-gray-300 border-gray-100 cursor-not-allowed' // Not booked, but block not available
                                                : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50'
                                    }
                                `}
                            >
                                {slot.label}
                                {isSelected && <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[10px] px-1.5 py-0.5 rounded-full font-bold shadow-sm">{details.duration}J</div>}
                            </button>
                        )
                    })}
                </div>
            </div>
            
            {details.selectedSlots.length > 0 && (
                 <div className="bg-emerald-50 p-4 rounded-xl flex justify-between items-center border border-emerald-100">
                    <div>
                        <span className="text-emerald-800 font-bold block">{details.duration} Jam</span>
                        <span className="text-xs text-emerald-600">
                            {details.selectedSlots[0].split('-')[1]}:00 - {parseInt(details.selectedSlots[details.selectedSlots.length-1].split('-')[1]) + 1}:00
                        </span>
                    </div>
                    <span className="text-xl font-bold text-emerald-700">RM {details.totalPrice}</span>
                 </div>
            )}
          </div>
        )}

        {/* Step 3: Summary & Details */}
        {step === BookingStep.SUMMARY && (
          <div className="space-y-6 animate-fade-in-up">
            
            {/* User Details Form */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="font-bold text-xl text-gray-800 mb-4">Maklumat Penyewa</h2>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Nama Penuh</label>
                        <div className="relative">
                            <User className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input 
                                type="text"
                                value={details.userName}
                                onChange={(e) => setDetails({...details, userName: e.target.value})}
                                placeholder="Contoh: Ali Bin Abu"
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input 
                                type="email"
                                value={details.userEmail}
                                onChange={(e) => setDetails({...details, userEmail: e.target.value})}
                                placeholder="ali@example.com"
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">No. Telefon</label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                            <input 
                                type="tel"
                                value={details.userPhone}
                                onChange={(e) => setDetails({...details, userPhone: e.target.value})}
                                placeholder="012-3456789"
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="font-bold text-xl text-gray-800 mb-6">Ringkasan Tempahan</h2>
                
                <div className="space-y-4">
                    <div className="flex items-start gap-3 pb-4 border-b border-gray-100">
                        <MapPin className="w-5 h-5 text-emerald-500 mt-1" />
                        <div>
                            <p className="text-sm text-gray-500">Gelanggang</p>
                            <p className="font-bold text-gray-800">{selectedCourt?.name}</p>
                            <p className="text-xs text-gray-400">{selectedCourt?.type} Floor</p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 pb-4 border-b border-gray-100">
                        <Calendar className="w-5 h-5 text-emerald-500 mt-1" />
                        <div>
                            <p className="text-sm text-gray-500">Tarikh</p>
                            <p className="font-bold text-gray-800">
                                {details.date.toLocaleDateString('ms-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 text-emerald-500 mt-1" />
                        <div>
                            <p className="text-sm text-gray-500">Masa ({details.duration} Jam)</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {details.selectedSlots.length > 0 && (
                                    <span className="text-sm font-medium text-gray-800">
                                        {availableSlots.find(s => s.id === details.selectedSlots[0])?.label} - 
                                        {parseInt(availableSlots.find(s => s.id === details.selectedSlots[details.selectedSlots.length-1])?.time.split(':')[0] || "0") + 1}:00
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-600">Harga per jam</span>
                    <span className="font-medium">RM {selectedCourt?.pricePerHour}</span>
                </div>
                <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-100">
                    <span className="text-gray-600">Jumlah jam</span>
                    <span className="font-medium">x {details.duration}</span>
                </div>
                <div className="flex justify-between items-center text-lg">
                    <span className="font-bold text-gray-800">Jumlah Besar</span>
                    <span className="font-extrabold text-emerald-600 text-2xl">RM {details.totalPrice.toFixed(2)}</span>
                </div>
            </div>

            <div className="flex items-center gap-2 p-3 bg-yellow-50 text-yellow-800 text-sm rounded-lg border border-yellow-100">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <p>Sila pastikan maklumat diri dan tempahan adalah betul.</p>
            </div>
          </div>
        )}

      </main>

      {/* Footer Navigation */}
      <footer className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 p-4 shadow-lg z-30">
        <div className="max-w-md mx-auto flex gap-3">
            {step > BookingStep.SELECT_COURT && (
                <button 
                    onClick={handleBack}
                    className="px-6 py-3 rounded-xl font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
            )}
            <button 
                onClick={handleNext}
                disabled={
                    (step === BookingStep.SELECT_COURT && !details.courtId) ||
                    (step === BookingStep.SELECT_DATE_TIME && details.selectedSlots.length === 0) ||
                    (step === BookingStep.SUMMARY && (!details.userName || !details.userEmail || !details.userPhone))
                }
                className={`
                    flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all
                    ${
                        ((step === BookingStep.SELECT_COURT && !details.courtId) || 
                         (step === BookingStep.SELECT_DATE_TIME && details.selectedSlots.length === 0) ||
                         (step === BookingStep.SUMMARY && (!details.userName || !details.userEmail || !details.userPhone))
                        )
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg active:scale-95'
                    }
                `}
            >
                {step === BookingStep.SUMMARY ? 'Bayar Sekarang' : 'Seterusnya'}
                {step !== BookingStep.SUMMARY && <ChevronRight className="w-5 h-5" />}
            </button>
        </div>
      </footer>

      <ChatBot />
    </div>
  );
};

export default App;