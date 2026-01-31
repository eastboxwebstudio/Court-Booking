import React, { useEffect, useState, useRef } from 'react';
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';

interface ToyyibPaySimulatorProps {
  amount: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const ToyyibPaySimulator: React.FC<ToyyibPaySimulatorProps> = ({ amount, onSuccess, onCancel }) => {
  const [status, setStatus] = useState<'loading' | 'confirm' | 'processing'>('loading');
  const timerRef = useRef<number | null>(null);

  // Simulate loading the gateway
  useEffect(() => {
    timerRef.current = window.setTimeout(() => {
      setStatus('confirm');
    }, 1500);
    return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handlePay = () => {
    setStatus('processing');
    if (timerRef.current) clearTimeout(timerRef.current);
    
    timerRef.current = window.setTimeout(() => {
      onSuccess();
    }, 2000);
  };

  // Cleanup on unmount for payment timer
  useEffect(() => {
      return () => {
          if (timerRef.current) clearTimeout(timerRef.current);
      }
  }, []);

  if (status === 'loading') {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-gray-200 border-t-red-600 rounded-full animate-spin mb-4"></div>
        <p className="text-gray-500 font-medium">Menghubungkan ke ToyyibPay...</p>
      </div>
    );
  }

  if (status === 'processing') {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center">
        <Loader2 className="w-16 h-16 text-emerald-600 animate-spin mb-4" />
        <p className="text-gray-800 font-bold text-lg">Memproses Pembayaran...</p>
        <p className="text-gray-500 text-sm">Jangan tutup browser ini.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-lg shadow-xl overflow-hidden border border-gray-200">
        {/* Mock ToyyibPay Header */}
        <div className="bg-[#2c3e50] p-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-lg italic">toyyibPay</h2>
          <div className="text-xs text-gray-300">Secure Payment</div>
        </div>

        <div className="p-6">
            <div className="text-center mb-6">
                <p className="text-gray-500 text-sm mb-1">Jumlah Perlu Dibayar</p>
                <h1 className="text-3xl font-bold text-gray-800">RM {amount.toFixed(2)}</h1>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg mb-6 border border-blue-100">
                <div className="flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-blue-800">CourtMas Booking</p>
                        <p className="text-xs text-blue-600">Merchant: CourtMas Sdn Bhd</p>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <button 
                    onClick={handlePay}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded shadow-md transition-colors flex justify-center items-center gap-2"
                >
                    Bayar FPX (Online Banking)
                </button>
                <button 
                    onClick={onCancel}
                    className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold py-3 rounded transition-colors"
                >
                    Batal Transaksi
                </button>
            </div>
            
            <div className="mt-6 text-center">
                <p className="text-[10px] text-gray-400">Powered by ToyyibPay Simulator</p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ToyyibPaySimulator;