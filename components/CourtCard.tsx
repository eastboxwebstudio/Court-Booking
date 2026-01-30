import React from 'react';
import { Court } from '../types';
import { CheckCircle2, User } from 'lucide-react';

interface CourtCardProps {
  court: Court;
  isSelected: boolean;
  onSelect: (id: number) => void;
}

const CourtCard: React.FC<CourtCardProps> = ({ court, isSelected, onSelect }) => {
  return (
    <div
      onClick={() => onSelect(court.id)}
      className={`
        relative p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer shadow-sm
        ${isSelected 
          ? 'border-emerald-500 bg-emerald-50' 
          : 'border-gray-200 bg-white hover:border-emerald-200'}
      `}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                ${isSelected ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500'}
            `}>
                {court.id}
            </div>
            <div>
                <h3 className="font-bold text-gray-800">{court.name}</h3>
                <p className="text-xs text-gray-500">Lantai {court.type}</p>
            </div>
        </div>
        {isSelected && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
      </div>
      
      <div className="flex justify-between items-end mt-3">
        <span className="text-sm font-medium text-emerald-700">RM {court.pricePerHour}/jam</span>
      </div>
    </div>
  );
};

export default CourtCard;