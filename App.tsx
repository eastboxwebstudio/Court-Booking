import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BookingDetails, BookingStep, Court, TimeSlot, AppView, BookingRecord } from './types';
import CourtCard from './components/CourtCard';
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
  Hourglass,
  CalendarDays,
  Activity,
  Trophy,
  AlertCircle,
  X,
  Loader2,
  CreditCard,
  Camera,
  Share2,
  ExternalLink,
  RefreshCw,
  Lock,
  LayoutDashboard,
  List,
  LogOut,
  Edit2,
  Database,
  Hammer,
  Plus,
  Save
} from 'lucide-react';

const START_HOUR = 8; // 8 AM
const END_HOUR = 23; // 11 PM
const BOOKING_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minutes

// --- MOCK DATA (Fallback jika server offline) ---
const MOCK_COURTS: Court[] = [
  { id: 1, name: "Court Dato' Lee", type: 'Rubber', sport: 'Badminton', pricePerHour: 20, isAvailable: true },
  { id: 2, name: "Court Misbun", type: 'Rubber', sport: 'Badminton', pricePerHour: 20, isAvailable: true },
  { id: 3, name: "Court Sidek", type: 'Parquet', sport: 'Badminton', pricePerHour: 15, isAvailable: true },
  { id: 4, name: "Arena Harimau", type: 'FIFA Turf', sport: 'Futsal', pricePerHour: 80, isAvailable: true },
  { id: 5, name: "Arena Bunga Raya", type: 'Vinyl', sport: 'Futsal', pricePerHour: 70, isAvailable: true },
  { id: 6, name: "Pickle Pro A", type: 'Hard Court', sport: 'Pickleball', pricePerHour: 25, isAvailable: true },
  { id: 7, name: "Pickle Pro B", type: 'Hard Court', sport: 'Pickleball', pricePerHour: 25, isAvailable: true },
];

interface ToastState {
    message: string;
    type: 'success' | 'error' | 'warning';
    id: number;
}

const App: React.FC = () => {
  // App View State
  const [currentView, setCurrentView] = useState<AppView>(AppView.USER);
  const [adminPin, setAdminPin] = useState("");
  const [isVerifyingPin, setIsVerifyingPin] = useState(false); 
  const [isInitializingDb, setIsInitializingDb] = useState(false);

  // Admin Add Court State
  const [isAddingCourt, setIsAddingCourt] = useState(false);
  const [newCourtData, setNewCourtData] = useState({
      name: '',
      type: '',
      sport: 'Badminton',
      pricePerHour: 20
  });

  const [step, setStep] = useState<BookingStep>(BookingStep.SELECT_COURT);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [dbError, setDbError] = useState(false); // New state to track critical DB errors
  
  // Payment Processing State
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false); 

  // Toast State
  const [toast, setToast] = useState<ToastState | null>(null);
  
  // State for Sport Filter
  const [selectedSport, setSelectedSport] = useState<'Badminton' | 'Futsal' | 'Pickleball'>('Badminton');

  // Data States
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookedSlots, setBookedSlots] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Admin Data States
  const [adminBookings, setAdminBookings] = useState<BookingRecord[]>([]);
  const [adminActiveTab, setAdminActiveTab] = useState<'orders' | 'content'>('orders');

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

  // Ref for the date input
  const dateInputRef = useRef<HTMLInputElement>(null);

  // --- HELPER: Date Formatting ---
  const getFormattedDateValue = (date: Date) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  // --- INITIALIZATION ---
  
  useEffect(() => {
    // LOAD SAVED USER DETAILS (Convenience feature)
    const savedUser = localStorage.getItem('userProfile');
    if (savedUser) {
        try {
            const { name, email, phone } = JSON.parse(savedUser);
            setDetails(prev => ({
                ...prev,
                userName: name || '',
                userEmail: email || '',
                userPhone: phone || ''
            }));
        } catch (e) {
            console.error("Failed to load saved user profile");
        }
    }

    // Check if we have returned from ToyyibPay
    const params = new URLSearchParams(window.location.search);
    const statusId = params.get('status_id');
    const billCode = params.get('billcode');

    if (statusId) {
        const savedBookingJson = localStorage.getItem('tempBooking');
        if (savedBookingJson) {
            const savedBooking = JSON.parse(savedBookingJson);
            savedBooking.date = new Date(savedBooking.date);
            savedBooking.bookingExpiry = Date.now() + BOOKING_TIMEOUT_MS;
            
            setDetails(savedBooking);
            localStorage.removeItem('tempBooking');

            if (statusId === '1') {
                saveBookingToSheet(savedBooking, billCode || undefined);
            } else if (statusId === '3') {
                showToast("Pembayaran tidak berjaya atau dibatalkan.", "error");
                setStep(BookingStep.SUMMARY);
            } else {
                showToast("Status pembayaran: Pending.", "warning");
                setStep(BookingStep.SUMMARY);
            }
        } else {
             if (statusId === '1') {
                showToast("Pembayaran berjaya, tetapi sesi telah tamat. Sila hubungi admin.", "warning");
             }
        }
        // Bersihkan URL
        window.history.replaceState({}, document.title, "/");
    }
  }, []);

  // --- API Fetching (Cloudflare Worker) ---
  const fetchCourts = async () => {
    setLoading(true);
    setDbError(false);
    try {
      const res = await fetch('/api/courts');
      
      if (!res.ok) {
          // If 500 error, it likely means DB table doesn't exist
          setDbError(true);
          throw new Error("Database Error or Table Missing");
      }
      
      const data = await res.json();
      
      if (Array.isArray(data) && data.length > 0) {
          // SQLite D1 simpan boolean sebagai 0/1, kita tukar jadi boolean sebenar untuk React
          const cleanData = data.map((c: any) => ({
            ...c,
            isAvailable: !!c.isAvailable
          }));
          setCourts(cleanData);
          setIsOfflineMode(false);
      } else {
          // Jika array kosong tapi status OK, mungkin table wujud tapi tiada data
          if (data.length === 0) setDbError(true); // Treat empty DB as needing init
          setCourts(MOCK_COURTS);
      }
    } catch (e) {
      console.warn("Using Offline Data (Courts):", e);
      setCourts(MOCK_COURTS);
      setIsOfflineMode(true);
      // Don't show toast on initial load to avoid annoyance, just show UI indicator
    } finally {
      setLoading(false);
    }
  };

  // Fetch Courts on Load
  useEffect(() => {
    fetchCourts();
  }, []);

  // Fetch Booked Slots when Date changes
  useEffect(() => {
    const fetchBookings = async () => {
        if (currentView !== AppView.USER) return; 
        const dateStr = getFormattedDateValue(details.date);
        try {
            const res = await fetch(`/api/bookings?date=${dateStr}`);
            if (!res.ok) throw new Error("Network response was not ok");
            
            const data = await res.json();
            
            if (Array.isArray(data)) {
                // `data` ialah array object { timeSlotId: "..." }
                const bookedSet = new Set(data.map((d: any) => d.timeSlotId));
                setBookedSlots(bookedSet);
            }
        } catch (e) {
            console.warn("Using Offline Data (Bookings):", e);
            setBookedSlots(new Set()); 
        }
    };
    fetchBookings();
  }, [details.date, currentView]);

  // --- ADMIN FUNCTIONS ---
  const fetchAllBookings = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/bookings');
        if (!res.ok) throw new Error("Network fail");
        
        const data = await res.json();
        if (Array.isArray(data)) {
            setAdminBookings(data);
        } else {
            setAdminBookings([]); 
        }
      } catch (e) {
          console.error(e);
          showToast("Gagal mengambil data tempahan.", "error");
          setAdminBookings([]);
      } finally {
          setLoading(false);
      }
  };

  const updateCourtDetails = async (courtId: number, newPrice?: number, isAvailable?: boolean) => {
      // Optimistic update
      setCourts(prev => prev.map(c => 
          c.id === courtId 
          ? { ...c, ...(newPrice !== undefined ? {pricePerHour: newPrice} : {}), ...(isAvailable !== undefined ? {isAvailable} : {}) } 
          : c
      ));

      try {
          const payload = {
              id: courtId,
              pricePerHour: newPrice,
              isAvailable: isAvailable
          };
          await fetch('/api/admin/court-update', {
              method: 'POST',
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
          });
          showToast("Kemaskini berjaya", "success");
      } catch(e) {
          showToast("Gagal kemaskini server", "error");
          fetchCourts(); // Revert
      }
  };

  const handleAddCourt = async () => {
      if(!newCourtData.name || !newCourtData.type) {
          showToast("Sila isi semua maklumat", "warning");
          return;
      }
      
      setLoading(true);
      try {
          const res = await fetch('/api/admin/courts', {
              method: 'POST',
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(newCourtData)
          });
          
          if(res.ok) {
              showToast("Gelanggang berjaya ditambah", "success");
              setIsAddingCourt(false);
              setNewCourtData({ name: '', type: '', sport: 'Badminton', pricePerHour: 20 });
              fetchCourts(); // Reload list
          } else {
              const data = await res.json();
              showToast(data.message || "Ralat server", "error");
          }
      } catch(e) {
          showToast("Ralat rangkaian", "error");
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      if (currentView === AppView.ADMIN_DASHBOARD && adminActiveTab === 'orders') {
          fetchAllBookings();
      }
  }, [currentView, adminActiveTab]);


  // --- Auto-Save User Profile ---
  const handleUserDetailsChange = (field: 'userName' | 'userEmail' | 'userPhone', value: string) => {
      setDetails(prev => {
          const newDetails = { ...prev, [field]: value };
          localStorage.setItem('userProfile', JSON.stringify({
              name: newDetails.userName,
              email: newDetails.userEmail,
              phone: newDetails.userPhone
          }));
          return newDetails;
      });
  };

  // --- SECURE ADMIN LOGIN ---
  const handleAdminLogin = async () => {
      if (!adminPin) {
          showToast("Sila masukkan PIN", "warning");
          return;
      }

      setIsVerifyingPin(true);

      try {
          const res = await fetch('/api/admin/verify', {
              method: 'POST',
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pin: adminPin })
          });

          const data = await res.json();
          
          if (res.ok && data.status === 'success') {
              setCurrentView(AppView.ADMIN_DASHBOARD);
              showToast("Selamat datang Admin!", "success");
          } else {
              showToast(data.message || "PIN Salah", "error");
          }
      } catch (e) {
          console.error(e);
          showToast("Gagal menyemak PIN.", "error");
      } finally {
          setIsVerifyingPin(false);
          setAdminPin("");
      }
  };

  // --- DATABASE INITIALIZATION (FIX) ---
  const handleInitializeDb = async () => {
      if (!confirm("Adakah anda pasti? Ini akan membina semula database.")) return;
      
      setIsInitializingDb(true);
      try {
          const res = await fetch('/api/init', { method: 'POST' });
          const data = await res.json();
          if (res.ok) {
              showToast("Database berjaya dibina!", "success");
              setDbError(false);
              // Reload courts to verify
              fetchCourts();
          } else {
              showToast("Gagal: " + data.message, "error");
          }
      } catch (e: any) {
          showToast("Ralat Network: " + e.message, "error");
      } finally {
          setIsInitializingDb(false);
      }
  };

  // Generate next 14 days for Quick Date Strip
  const next14Days = useMemo(() => {
    const days = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        days.push(d);
    }
    return days;
  }, []);

  // Filter courts based on selected sport
  const filteredCourts = useMemo(() => 
    courts.filter(c => c.sport === selectedSport),
  [selectedSport, courts]);

  // Derived state for selected court
  const selectedCourt = useMemo(() => 
    courts.find(c => c.id === details.courtId), 
  [details.courtId, courts]);

  // Generate Slots based on date and Real Availability
  const generateTimeSlots = (date: Date): TimeSlot[] => {
    const slots: TimeSlot[] = [];
    const dateStr = getFormattedDateValue(date);
    
    for (let i = START_HOUR; i <= END_HOUR; i++) {
      const timeStr = `${i}:00`;
      const label = i > 12 ? `${i - 12} PM` : `${i} AM`;
      const slotId = `${dateStr}-${i}`;
      
      const isBooked = bookedSlots.has(slotId);

      slots.push({
        id: slotId,
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
  }, [details.date, bookedSlots]); 

  // --- Timeout Logic ---
  useEffect(() => {
    let interval: any;

    if (step === BookingStep.SUMMARY && details.bookingExpiry) {
      interval = setInterval(() => {
        const remaining = details.bookingExpiry! - Date.now();
        if (remaining <= 0) {
          showToast("Masa pembayaran tamat (15 Minit). Sila buat tempahan semula.", "error");
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

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  };

  // --- Handlers ---

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const [year, month, day] = e.target.value.split('-').map(Number);
    const newDate = new Date(year, month - 1, day);
    setDetails(prev => ({ ...prev, date: newDate, selectedSlots: [] }));
  };

  const handleSelectDateDirectly = (date: Date) => {
    setDetails(prev => ({ ...prev, date: date, selectedSlots: [] }));
  };

  const handleOpenPicker = () => {
    try {
        if (dateInputRef.current && typeof dateInputRef.current.showPicker === 'function') {
            dateInputRef.current.showPicker();
        } else {
            dateInputRef.current?.focus();
            dateInputRef.current?.click();
        }
    } catch (e) {
        console.warn('Browser prevented showPicker:', e);
    }
  };

  const handleDurationSelect = (hours: number) => {
    setDetails(prev => ({ ...prev, duration: hours, selectedSlots: [], totalPrice: 0 }));
  };

  const handleSlotSelect = (startSlot: TimeSlot) => {
    if (startSlot.isBooked) return;

    const slotsToBook: string[] = [];
    let isValid = true;

    for (let i = 0; i < details.duration; i++) {
        const targetHour = startSlot.hour + i;
        if (targetHour > END_HOUR) {
            isValid = false; 
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
        showToast(`Slot tidak mencukupi untuk tempahan ${details.duration} jam.`, "warning");
    }
  };

  const handleNext = () => {
    if (step === BookingStep.SELECT_COURT && details.courtId) {
      setStep(BookingStep.SELECT_DATE_TIME);
    } else if (step === BookingStep.SELECT_DATE_TIME && details.selectedSlots.length > 0) {
      setDetails(prev => ({ ...prev, bookingExpiry: Date.now() + BOOKING_TIMEOUT_MS }));
      setStep(BookingStep.SUMMARY);
    } else if (step === BookingStep.SUMMARY) {
      // Step 3 Next -> Initiate Payment (Real)
      handleInitiatePayment();
    }
  };

  const handleBack = () => {
    if (step === BookingStep.SUMMARY) {
        setDetails(prev => ({ ...prev, bookingExpiry: null }));
        setAgreedToTerms(false); // Reset T&C when going back
    }
    if (step > 1) setStep(step - 1);
  };

  const handleShareReceipt = async () => {
    if (navigator.share) {
        try {
            await navigator.share({
                title: 'Resit Tempahan CourtMas',
                text: `Tempahan ${selectedCourt?.name} pada ${details.date.toLocaleDateString()} disahkan!`,
                url: window.location.href, // Or a specific receipt URL if available
            });
        } catch (error) {
            console.log('Error sharing', error);
        }
    } else {
        showToast("Fungsi kongsi tidak disokong pada pelayar ini.", "warning");
    }
  };

  // --- PAYMENT LOGIC (REAL - CLOUDFLARE BACKEND) ---

  const handleInitiatePayment = async () => {
    if (!selectedCourt) return;
    if (!agreedToTerms) {
        showToast("Sila setuju dengan Terma & Syarat.", "warning");
        return;
    }
    
    setIsProcessingPayment(true);
    setPaymentUrl(null); // Reset
    
    try {
        // 1. Simpan state sementara ke localStorage
        localStorage.setItem('tempBooking', JSON.stringify(details));

        // 2. Bersihkan No Telefon
        const cleanPhone = details.userPhone.replace(/[^0-9]/g, '');

        // 3. Request URL Pembayaran dari Backend (Worker)
        const payload = {
            courtName: selectedCourt.name,
            dateStr: getFormattedDateValue(details.date),
            totalPrice: details.totalPrice,
            userName: details.userName,
            userEmail: details.userEmail,
            userPhone: cleanPhone
        };

        const res = await fetch('/api/payment', {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok && data.status === 'success' && data.paymentUrl) {
            setPaymentUrl(data.paymentUrl);
            setTimeout(() => {
                window.location.href = data.paymentUrl;
            }, 1000); 

        } else {
            throw new Error(data.message || 'Gagal mendapatkan link pembayaran.');
        }

    } catch (e: any) {
        console.error("Payment Init Error:", e);
        showToast(e.message || "Ralat menghubungkan ke ToyyibPay.", "error");
        setIsProcessingPayment(false);
    }
  };

  const saveBookingToSheet = async (bookingData: BookingDetails, billCode?: string) => {
    setIsProcessingPayment(true); 
    try {
        const payload = {
            courtId: bookingData.courtId,
            date: getFormattedDateValue(bookingData.date),
            selectedSlots: bookingData.selectedSlots,
            userName: bookingData.userName,
            userEmail: bookingData.userEmail,
            userPhone: bookingData.userPhone,
            totalPrice: bookingData.totalPrice,
            billCode: billCode
        };

        // Call Worker API untuk simpan ke D1
        const res = await fetch('/api/bookings', {
            method: 'POST',
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error('Network error');
        
        // Success
        setDetails(prev => ({ ...prev, bookingExpiry: null }));
        setStep(BookingStep.SUCCESS);
        
    } catch (e) {
        console.error("Save Error:", e);
        showToast("Pembayaran berjaya, tetapi data gagal disimpan ke database. Sila simpan resit.", "warning");
        setDetails(prev => ({ ...prev, bookingExpiry: null }));
        setStep(BookingStep.SUCCESS);
        setIsOfflineMode(true);
    } finally {
        setIsProcessingPayment(false);
    }
  };

  const resetBooking = () => {
    localStorage.removeItem('tempBooking');
    const savedUser = localStorage.getItem('userProfile');
    const userDefaults = savedUser ? JSON.parse(savedUser) : {};

    setDetails({
        courtId: null,
        date: new Date(),
        selectedSlots: [],
        duration: 1,
        totalPrice: 0,
        userName: userDefaults.name || details.userName,
        userEmail: userDefaults.email || details.userEmail,
        userPhone: userDefaults.phone || details.userPhone,
        bookingExpiry: null
    });
    setStep(BookingStep.SELECT_COURT);
    setAgreedToTerms(false);
    setTimeLeft(null);
    const dateStr = getFormattedDateValue(new Date());
    setBookedSlots(new Set()); 
  };

  // --- Helper: Toast ---
  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'error') => {
      const id = Date.now();
      setToast({ message, type, id });
      setTimeout(() => {
          setToast(prev => prev?.id === id ? null : prev);
      }, 6000); 
  };

  // --- VIEWS ---

  // 1. Admin Login View
  if (currentView === AppView.ADMIN_LOGIN) {
      return (
          <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
              <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm text-center relative">
                  
                  <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Lock className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-xl font-bold text-gray-800 mb-6">Akses Admin</h2>
                  
                  <input 
                      type="password"
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAdminLogin()}
                      placeholder="Masukkan PIN (Default: 123456)"
                      className="w-full text-center text-2xl tracking-widest p-3 bg-gray-100 rounded-xl border border-gray-300 mb-6 focus:ring-2 focus:ring-emerald-500 outline-none"
                      maxLength={6}
                  />

                  <button 
                      onClick={handleAdminLogin}
                      disabled={isVerifyingPin}
                      className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold mb-3 hover:bg-gray-800 disabled:opacity-50 flex justify-center items-center gap-2"
                  >
                      {isVerifyingPin && <Loader2 className="w-4 h-4 animate-spin" />}
                      {isVerifyingPin ? "Menyemak..." : "Masuk"}
                  </button>
 
                  <button 
                      onClick={() => setCurrentView(AppView.USER)}
                      className="text-sm text-gray-500 hover:text-gray-700 block mx-auto mb-6"
                  >
                      Kembali ke Utama
                  </button>

                  <div className="pt-6 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-2">Masalah Database?</p>
                    <button 
                        onClick={handleInitializeDb}
                        disabled={isInitializingDb}
                        className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-100 flex items-center justify-center gap-1 mx-auto"
                    >
                         {isInitializingDb ? <Loader2 className="w-3 h-3 animate-spin"/> : <Database className="w-3 h-3" />}
                         Reset / Init Database
                    </button>
                  </div>
              </div>
          </div>
      )
  }

  // 2. Admin Dashboard View
  if (currentView === AppView.ADMIN_DASHBOARD) {
      return (
          <div className="min-h-screen bg-gray-100 pb-20 relative">
              {/* Add Court Modal */}
              {isAddingCourt && (
                  <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
                      <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
                          <div className="flex justify-between items-center mb-4">
                              <h3 className="font-bold text-lg">Tambah Gelanggang</h3>
                              <button onClick={() => setIsAddingCourt(false)}><X className="w-5 h-5 text-gray-400" /></button>
                          </div>
                          <div className="space-y-4">
                              <div>
                                  <label className="text-xs text-gray-500 font-bold block mb-1">Nama Court</label>
                                  <input 
                                    type="text" 
                                    className="w-full border rounded-lg p-2 text-sm"
                                    placeholder="Contoh: Arena Jaguh 1"
                                    value={newCourtData.name}
                                    onChange={e => setNewCourtData({...newCourtData, name: e.target.value})}
                                  />
                              </div>
                              <div className="flex gap-2">
                                  <div className="flex-1">
                                      <label className="text-xs text-gray-500 font-bold block mb-1">Sukan</label>
                                      <select 
                                        className="w-full border rounded-lg p-2 text-sm"
                                        value={newCourtData.sport}
                                        onChange={e => setNewCourtData({...newCourtData, sport: e.target.value as any})}
                                      >
                                          <option value="Badminton">Badminton</option>
                                          <option value="Futsal">Futsal</option>
                                          <option value="Pickleball">Pickleball</option>
                                      </select>
                                  </div>
                                  <div className="flex-1">
                                      <label className="text-xs text-gray-500 font-bold block mb-1">Jenis Lantai</label>
                                      <input 
                                        type="text" 
                                        className="w-full border rounded-lg p-2 text-sm"
                                        placeholder="Contoh: Rubber"
                                        value={newCourtData.type}
                                        onChange={e => setNewCourtData({...newCourtData, type: e.target.value})}
                                      />
                                  </div>
                              </div>
                              <div>
                                  <label className="text-xs text-gray-500 font-bold block mb-1">Harga (RM/Jam)</label>
                                  <input 
                                    type="number" 
                                    className="w-full border rounded-lg p-2 text-sm"
                                    value={newCourtData.pricePerHour}
                                    onChange={e => setNewCourtData({...newCourtData, pricePerHour: Number(e.target.value)})}
                                  />
                              </div>
                              <button 
                                onClick={handleAddCourt}
                                disabled={loading}
                                className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 mt-4 hover:bg-emerald-700"
                              >
                                  {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                                  Simpan
                              </button>
                          </div>
                      </div>
                  </div>
              )}

              {/* Admin Header */}
              <div className="bg-gray-900 text-white p-6 rounded-b-[2rem] shadow-lg mb-6">
                  <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-bold flex items-center gap-2">
                          <LayoutDashboard className="w-6 h-6 text-emerald-400" />
                          Admin Panel
                      </h2>
                      <button 
                        onClick={() => setCurrentView(AppView.USER)} 
                        className="bg-gray-800 p-2 rounded-full hover:bg-gray-700 text-xs flex items-center gap-2 px-4"
                      >
                          <LogOut className="w-3 h-3" /> Logout
                      </button>
                  </div>
                  
                  {/* Tabs */}
                  <div className="flex bg-gray-800 p-1 rounded-xl">
                      <button 
                        onClick={() => setAdminActiveTab('orders')}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 ${adminActiveTab === 'orders' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                      >
                        <List className="w-3 h-3" /> Tempahan
                      </button>
                      <button 
                        onClick={() => setAdminActiveTab('content')}
                        className={`flex-1 py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-2 ${adminActiveTab === 'content' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                      >
                        <Edit2 className="w-3 h-3" /> Gelanggang
                      </button>
                  </div>
              </div>

              {/* Toast for Admin */}
              {toast && (
                <div className={`
                    fixed top-4 left-1/2 transform -translate-x-1/2 w-[90%] max-w-sm p-3 rounded-lg shadow-xl flex items-center gap-3 z-[100]
                    ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white'}
                `}>
                    <span className="text-sm font-semibold">{toast.message}</span>
                </div>
              )}

              {/* Tab 1: Orders */}
              {adminActiveTab === 'orders' && (
                  <div className="px-4 space-y-4">
                      <div className="flex justify-between items-center mb-2">
                          <h3 className="font-bold text-gray-700">Terbaru (50)</h3>
                          <button onClick={fetchAllBookings} className="text-emerald-600 text-xs font-bold flex items-center gap-1">
                              <RefreshCw className="w-3 h-3" /> Refresh
                          </button>
                      </div>

                      {loading ? (
                          <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-gray-400"/></div>
                      ) : adminBookings.length === 0 ? (
                          <div className="text-center py-10 text-gray-400">Tiada tempahan.</div>
                      ) : (
                          adminBookings.map((b, i) => {
                              // Safety Check for rendering
                              const dateStr = b.date ? new Date(b.date).toLocaleDateString() : 'N/A';
                              // ID slot format: YYYY-MM-DD-HOUR
                              const timeStr = b.timeSlotId && typeof b.timeSlotId === 'string' ? b.timeSlotId.split('-').pop() + ':00' : 'N/A';
                              
                              return (
                                <div key={i} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm"># {b.id}</p>
                                            <p className="text-xs text-gray-500">
                                                {dateStr} | {timeStr}
                                            </p>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${b.billCode && b.billCode !== '-' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                            {b.billCode && b.billCode !== '-' ? 'PAID' : 'PENDING'}
                                        </span>
                                    </div>
                                    <div className="border-t border-gray-100 pt-2 mt-2 flex justify-between items-end">
                                        <div>
                                            <p className="text-sm font-medium text-gray-800">{b.userName || 'No Name'}</p>
                                            <p className="text-xs text-gray-400">{b.userPhone || '-'}</p>
                                        </div>
                                        <p className="font-bold text-emerald-600">RM {b.totalPrice}</p>
                                    </div>
                                </div>
                              );
                          })
                      )}
                  </div>
              )}

              {/* Tab 2: Content (Courts) */}
              {adminActiveTab === 'content' && (
                  <div className="px-4 space-y-4">
                      
                      {/* Add Court Button */}
                      <button 
                        onClick={() => setIsAddingCourt(true)}
                        className="w-full bg-emerald-100 text-emerald-700 py-3 rounded-xl font-bold border border-emerald-200 flex items-center justify-center gap-2 hover:bg-emerald-200 transition"
                      >
                          <Plus className="w-5 h-5" />
                          Tambah Gelanggang
                      </button>

                      {courts.map(court => (
                          <div key={court.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                              <div>
                                  <p className="font-bold text-gray-800">{court.name}</p>
                                  <p className="text-xs text-gray-500">{court.sport} - {court.type}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                  <div className="text-right">
                                      <label className="block text-[10px] text-gray-400">RM/Jam</label>
                                      <input 
                                          type="number" 
                                          defaultValue={court.pricePerHour}
                                          onBlur={(e) => updateCourtDetails(court.id, Number(e.target.value), undefined)}
                                          className="w-16 text-right border rounded p-1 text-sm font-bold text-gray-800"
                                      />
                                  </div>
                                  <button 
                                      onClick={() => updateCourtDetails(court.id, undefined, !court.isAvailable)}
                                      className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${court.isAvailable ? 'bg-emerald-500 justify-end' : 'bg-gray-300 justify-start'}`}
                                  >
                                      <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${court.isAvailable ? 'translate-x-0' : '-translate-x-0'}`}></div>
                                  </button>
                              </div>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      )
  }

  // Loading Screen for Payment Processing
  if (isProcessingPayment) {
      return (
        <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 text-center">
            <Loader2 className="w-16 h-16 text-emerald-600 animate-spin mb-6" />
            <h2 className="text-xl font-bold text-gray-800 mb-2">
                {paymentUrl ? "Mengalihkan ke Bank..." : "Sedang Memproses..."}
            </h2>
            <p className="text-gray-500 mb-6 max-w-xs">
                {paymentUrl 
                    ? "Sila tunggu sebentar. Jika tidak dialihkan secara automatik, tekan butang di bawah." 
                    : "Sila tunggu sebentar. Jangan tutup tetingkap ini."}
            </p>
            
            {/* Fallback Manual Link */}
            {paymentUrl && (
                <a 
                    href={paymentUrl}
                    className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-6 py-3 rounded-xl font-bold hover:bg-emerald-200 transition animate-pulse"
                >
                    <ExternalLink className="w-5 h-5" />
                    Bayar Manual Di Sini
                </a>
            )}
        </div>
      );
  }

  if (step === BookingStep.SUCCESS) {
      return (
          <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center relative">
              {/* Toast for success case if error happened during save */}
              {toast && (
                <div className={`
                    absolute top-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-sm p-4 rounded-xl shadow-2xl flex items-center gap-3 z-[100] animate-fade-in-down
                    ${toast.type === 'error' ? 'bg-red-500 text-white' : toast.type === 'warning' ? 'bg-orange-500 text-white' : 'bg-emerald-600 text-white'}
                `}>
                    {toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                    <span className="text-sm font-semibold text-left">{toast.message}</span>
                </div>
              )}

              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 animate-bounce-slow">
                <CheckCircle className="w-10 h-10 text-emerald-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Tempahan Berjaya!</h1>
              <p className="text-gray-500 mb-8">
                Terima kasih, <span className="font-semibold text-gray-800">{details.userName}</span>. 
                Resit telah dihantar ke <span className="font-semibold">{details.userEmail}</span>.
              </p>
              
              <div className="bg-gray-50 p-6 rounded-xl w-full max-w-sm mb-6 text-left border border-gray-100 shadow-inner">
                  <p className="text-xs text-gray-400 mb-1">ID Tempahan</p>
                  <p className="font-mono font-bold text-gray-800 mb-4">#TOYYIB-{Math.floor(Math.random() * 10000)}</p>
                  
                  <p className="text-xs text-gray-400 mb-1">Court</p>
                  <p className="font-semibold text-gray-800 mb-4">{selectedCourt?.name}</p>
                  <p className="text-xs text-gray-500 mb-4">({selectedCourt?.sport})</p>

                  <p className="text-xs text-gray-400 mb-1">Tarikh & Masa</p>
                  <p className="font-semibold text-gray-800 mb-4">
                      {details.date.toLocaleDateString('ms-MY', { day: 'numeric', month: 'long' })}
                      <br/>
                      {details.selectedSlots.length} Slot ({details.selectedSlots.length} Jam)
                  </p>
              </div>

              <div className="flex items-center justify-center gap-2 text-gray-400 text-xs mb-8">
                  <Camera className="w-4 h-4" />
                  <span>Sila tangkap layar (screenshot) resit ini.</span>
              </div>

              <div className="flex flex-col gap-3 w-full max-w-xs">
                {navigator.share && (
                    <button 
                        onClick={handleShareReceipt}
                        className="w-full flex items-center justify-center gap-2 bg-emerald-100 text-emerald-700 py-3 rounded-xl font-bold hover:bg-emerald-200 transition"
                    >
                        <Share2 className="w-4 h-4" />
                        Kongsi Resit
                    </button>
                )}
                
                <button 
                    onClick={resetBooking}
                    className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition"
                >
                    Tempah Lagi
                </button>
              </div>

              {isOfflineMode && (
                <div className="mt-8 p-3 bg-yellow-50 text-yellow-700 text-xs rounded-lg border border-yellow-100 max-w-xs">
                    <p className="font-bold">Mod Luar Talian</p>
                    <p>Tempahan ini disimpan secara tempatan kerana sambungan ke server gagal.</p>
                </div>
              )}
          </div>
      )
  }

  return (
    <div className="min-h-screen pb-20 max-w-md mx-auto bg-gray-50 shadow-2xl relative overflow-hidden">
      
      {/* Toast Notification Container */}
      {toast && (
        <div className={`
            fixed top-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-sm p-4 rounded-xl shadow-2xl flex items-center gap-3 z-[100] animate-fade-in-down transition-all
            ${toast.type === 'error' ? 'bg-red-500 text-white' : toast.type === 'warning' ? 'bg-orange-500 text-white' : 'bg-emerald-600 text-white'}
        `}>
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 flex-shrink-0" />}
            {toast.type === 'success' && <CheckCircle className="w-5 h-5 flex-shrink-0" />}
            <span className="text-sm font-semibold flex-1">{toast.message}</span>
            <button onClick={() => setToast(null)}><X className="w-4 h-4 opacity-70" /></button>
        </div>
      )}

      {/* Header */}
      <header className="bg-emerald-600 text-white p-6 pb-12 rounded-b-[2rem] shadow-lg relative z-10">
        <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight">CourtMas 🏸</h1>
            <div className="flex items-center gap-3">
                {isOfflineMode && (
                    <button 
                        onClick={fetchCourts}
                        className="bg-yellow-500/20 px-2 py-1 rounded-full flex items-center gap-1 active:scale-95 transition" 
                        title="Klik untuk cuba sambung semula"
                    >
                        <RefreshCw className="w-3 h-3 text-yellow-200" />
                        <span className="text-[10px] font-bold text-yellow-100">Offline</span>
                    </button>
                )}
                
                {/* ADMIN ICON (No Settings anymore) */}
                <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center cursor-pointer" onClick={() => setCurrentView(AppView.ADMIN_LOGIN)}>
                    <User className="w-5 h-5" />
                </div>
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

        {/* --- CRITICAL: DB INIT BUTTON ON MAIN SCREEN IF ERROR --- */}
        {dbError && step === BookingStep.SELECT_COURT && (
            <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl flex flex-col items-center text-center animate-bounce-slow">
                <Database className="w-8 h-8 text-red-500 mb-2" />
                <h3 className="font-bold text-red-800">Database Belum Siap!</h3>
                <p className="text-xs text-red-600 mb-3">Table tidak dijumpai. Sila tekan butang di bawah untuk setup.</p>
                <button 
                    onClick={handleInitializeDb}
                    disabled={isInitializingDb}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-red-700"
                >
                    {isInitializingDb ? <Loader2 className="w-4 h-4 animate-spin"/> : <Hammer className="w-4 h-4" />}
                    Setup Database Sekarang
                </button>
            </div>
        )}
        
        {/* Step 1: Court Selection */}
        {step === BookingStep.SELECT_COURT && (
          <div className="space-y-4 animate-fade-in-up">
            
            {/* Sport Category Tabs */}
            <div className="bg-white p-1 rounded-xl shadow-sm border border-gray-100 flex mb-2">
                {(['Badminton', 'Futsal', 'Pickleball'] as const).map((sport) => (
                    <button
                        key={sport}
                        onClick={() => {
                            setSelectedSport(sport);
                            setDetails(prev => ({ ...prev, courtId: null })); 
                        }}
                        className={`
                            flex-1 py-2 text-sm font-bold rounded-lg transition-all
                            ${selectedSport === sport 
                                ? 'bg-emerald-600 text-white shadow-sm' 
                                : 'text-gray-500 hover:bg-gray-50'}
                        `}
                    >
                        {sport}
                    </button>
                ))}
            </div>

            <h2 className="font-bold text-gray-800 text-lg mb-2 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-emerald-600" />
                Senarai Gelanggang {selectedSport}
            </h2>

            {loading ? (
                 <div className="text-center py-10">
                    <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                    <p className="text-gray-400 text-sm">Menyambung ke Database...</p>
                 </div>
            ) : filteredCourts.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
                    <p className="text-gray-400">Tiada gelanggang tersedia.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                {filteredCourts.map(court => (
                    <CourtCard 
                        key={court.id} 
                        court={court} 
                        isSelected={details.courtId === court.id}
                        onSelect={(id) => setDetails(prev => ({ ...prev, courtId: id, selectedSlots: [], totalPrice: 0 }))}
                    />
                ))}
                </div>
            )}
          </div>
        )}

        {/* Step 2: Date & Time */}
        {step === BookingStep.SELECT_DATE_TIME && (
          <div className="space-y-8 animate-fade-in-up">
            
            {/* Date Selection */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-emerald-600" /> 
                        Pilih Tarikh
                    </h2>

                    <div className="relative">
                         <input
                            ref={dateInputRef}
                            type="date"
                            min={getFormattedDateValue(new Date())}
                            value={getFormattedDateValue(details.date)}
                            onChange={handleDateChange}
                            className="absolute opacity-0 w-1 h-1 -z-10" 
                        />
                        <button 
                            onClick={handleOpenPicker}
                            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-100 transition"
                        >
                            <CalendarDays className="w-4 h-4" />
                            Kalendar
                        </button>
                    </div>
                </div>

                {/* Big Date Display */}
                <div className="flex flex-col items-center justify-center py-6 bg-gradient-to-br from-gray-50 to-white rounded-xl border border-gray-100 mb-4">
                    <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">Tarikh Dipilih</span>
                    <span className="text-3xl font-extrabold text-gray-800 leading-tight">
                        {details.date.getDate()}
                    </span>
                    <span className="text-lg font-bold text-gray-600">
                        {details.date.toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' })}
                    </span>
                    <span className="text-sm text-gray-400 font-medium mt-1 uppercase">
                         {details.date.toLocaleDateString('ms-MY', { weekday: 'long' })}
                    </span>
                </div>

                {/* Quick Date Strip */}
                <div className="relative">
                    <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                        {next14Days.map((d, i) => {
                            const selected = isSameDay(d, details.date);
                            return (
                                <button
                                    key={i}
                                    onClick={() => handleSelectDateDirectly(d)}
                                    className={`
                                        flex flex-col items-center justify-center min-w-[60px] h-[70px] rounded-lg border transition-all flex-shrink-0
                                        ${selected 
                                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md transform scale-105' 
                                            : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300 hover:bg-gray-50'}
                                    `}
                                >
                                    <span className="text-[10px] font-bold uppercase opacity-80">
                                        {i === 0 ? 'Hari Ini' : d.toLocaleDateString('ms-MY', { weekday: 'short' })}
                                    </span>
                                    <span className="text-xl font-bold leading-none mt-1">
                                        {d.getDate()}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                    <div className="absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-white to-transparent pointer-events-none"></div>
                </div>
            </div>

            {/* Duration Selector */}
            <div>
                <h2 className="font-bold text-gray-800 text-lg mb-3 flex items-center gap-2">
                    <Hourglass className="w-5 h-5 text-emerald-600" />
                    Tempoh Main
                </h2>
                <div className="grid grid-cols-4 gap-2 sm:gap-3">
                    {Array.from({ length: 4 }, (_, i) => i + 1).map(h => (
                        <button
                            key={h}
                            onClick={() => handleDurationSelect(h)}
                            className={`
                                py-3 rounded-xl font-bold border-2 transition-all flex flex-col items-center justify-center
                                ${details.duration === h 
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg scale-[1.02]' 
                                    : 'bg-white text-gray-600 border-gray-100 hover:border-emerald-200 hover:bg-gray-50'}
                            `}
                        >
                            <span className="text-lg">{h}</span>
                            <span className="text-[10px] uppercase opacity-80">Jam</span>
                        </button>
                    ))}
                     {Array.from({ length: 2 }, (_, i) => i + 5).map(h => (
                        <button
                            key={h}
                            onClick={() => handleDurationSelect(h)}
                            className={`
                                py-3 rounded-xl font-bold border-2 transition-all flex flex-col items-center justify-center
                                ${details.duration === h 
                                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg scale-[1.02]' 
                                    : 'bg-white text-gray-400 border-gray-100 hover:border-emerald-200 hover:bg-gray-50'}
                            `}
                        >
                           <span className="text-base">{h}</span>
                           <span className="text-[10px] uppercase opacity-80">Jam</span>
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <div className="flex items-center justify-between mb-4">
                     <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        <Clock className="w-5 h-5 text-emerald-600" /> 
                        Pilih Waktu Mula
                    </h2>
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                        {availableSlots.filter(s => !s.isBooked).length} Slot Kosong
                    </span>
                </div>
               
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {availableSlots.map(slot => {
                        const isSelected = details.selectedSlots.includes(slot.id);
                        
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
                                    py-3 px-1 rounded-xl text-sm font-bold border transition-all relative flex flex-col items-center justify-center
                                    ${slot.isBooked 
                                        ? 'bg-gray-50 text-gray-300 border-transparent cursor-not-allowed' 
                                        : isSelected
                                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-200 ring-offset-1 transform scale-105 z-10'
                                            : isDisabled 
                                                ? 'bg-white text-gray-300 border-gray-100 cursor-not-allowed' 
                                                : 'bg-white text-gray-700 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50'
                                    }
                                `}
                            >
                                {slot.label}
                                {isSelected && <div className="absolute -top-2 -right-2 bg-yellow-400 text-yellow-900 text-[9px] px-1.5 py-0.5 rounded-full font-extrabold shadow-sm">{details.duration}J</div>}
                            </button>
                        )
                    })}
                </div>
            </div>
            
            {details.selectedSlots.length > 0 && (
                 <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-20 animate-fade-in-up">
                     <div className="bg-gray-900 text-white p-4 rounded-xl flex justify-between items-center shadow-xl border border-gray-800">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-500 p-2 rounded-lg text-white">
                                <Activity className="w-5 h-5" />
                            </div>
                            <div>
                                <span className="font-bold block text-sm">{details.duration} Jam</span>
                                <span className="text-xs text-gray-400">
                                    {availableSlots.find(s => s.id === details.selectedSlots[0])?.time} - 
                                    {parseInt(availableSlots.find(s => s.id === details.selectedSlots[details.selectedSlots.length-1])?.time.split(':')[0] || "0") + 1}:00
                                </span>
                            </div>
                        </div>
                        <span className="text-xl font-bold text-emerald-400">RM {details.totalPrice}</span>
                     </div>
                 </div>
            )}
          </div>
        )}

        {/* Step 3: Summary & Details */}
        {step === BookingStep.SUMMARY && (
          <div className="space-y-6 animate-fade-in-up">
            
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
                                onChange={(e) => handleUserDetailsChange('userName', e.target.value)}
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
                                onChange={(e) => handleUserDetailsChange('userEmail', e.target.value)}
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
                                onChange={(e) => handleUserDetailsChange('userPhone', e.target.value)}
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
                            <p className="text-xs text-gray-400">{selectedCourt?.sport} - {selectedCourt?.type}</p>
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
                <div className="flex justify-between items-center text-lg pb-4 border-b border-gray-100 mb-4">
                    <span className="font-bold text-gray-800">Jumlah Besar</span>
                    <span className="font-extrabold text-emerald-600 text-2xl">RM {details.totalPrice.toFixed(2)}</span>
                </div>

                {/* Terms & Conditions Checkbox */}
                <div 
                    onClick={() => setAgreedToTerms(!agreedToTerms)}
                    className="flex items-start gap-3 cursor-pointer p-2 -ml-2 rounded-lg hover:bg-gray-50 transition"
                >
                    <div className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors ${agreedToTerms ? 'bg-emerald-600 border-emerald-600' : 'border-gray-300 bg-white'}`}>
                        {agreedToTerms && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-gray-600 leading-snug select-none">
                            Saya bersetuju dengan <span className="font-bold text-gray-800">peraturan gelanggang</span> dan memahami bahawa bayaran <span className="text-red-500 font-bold">tidak akan dikembalikan</span> jika saya membatalkan tempahan.
                        </p>
                    </div>
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
        <div className="max-w-md mx-auto flex flex-col gap-3">
            <div className="flex gap-3">
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
                        (step === BookingStep.SUMMARY && (!details.userName || !details.userEmail || !details.userPhone || !agreedToTerms))
                    }
                    className={`
                        flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all
                        ${
                            ((step === BookingStep.SELECT_COURT && !details.courtId) || 
                            (step === BookingStep.SELECT_DATE_TIME && details.selectedSlots.length === 0) ||
                            (step === BookingStep.SUMMARY && (!details.userName || !details.userEmail || !details.userPhone || !agreedToTerms))
                            )
                            ? 'bg-gray-300 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg active:scale-95'
                        }
                    `}
                >
                    {step === BookingStep.SUMMARY ? (
                        <div className="flex items-center gap-2">
                            <span>Bayar Online (FPX)</span>
                            <CreditCard className="w-4 h-4" />
                        </div>
                    ) : (
                        <>
                            <span>Seterusnya</span>
                            <ChevronRight className="w-5 h-5" />
                        </>
                    )}
                </button>
            </div>
            
            {/* Hidden Admin Link */}
            <div className="text-center pt-1">
                <button 
                  onClick={() => setCurrentView(AppView.ADMIN_LOGIN)}
                  className="text-[10px] text-gray-300 hover:text-gray-500 transition-colors"
                >
                    Admin Login
                </button>
            </div>
        </div>
      </footer>
      <ChatBot />
    </div>
  );
};

export default App;