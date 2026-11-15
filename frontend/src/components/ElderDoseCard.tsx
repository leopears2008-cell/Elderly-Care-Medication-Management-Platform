'use client';

import { useState } from 'react';
import type { Medication } from '@/lib/api';

interface Props {
  medication: Medication;
  onTaken: () => void;
  onMissed: () => void;
}

export default function ElderDoseCard({ medication, onTaken, onMissed }: Props) {
  const [status, setStatus] = useState<'pending' | 'taken' | 'missed'>('pending');

  const speak = () => {
    if (!window.speechSynthesis) {
      alert('Text-to-speech is not supported in your browser.');
      return;
    }
    window.speechSynthesis.cancel();
    const text = [
      `Medication: ${medication.name}.`,
      `Dosage: ${medication.dosage}.`,
      `Take at: ${medication.dose_times.join(' and ')}.`,
      medication.instructions ? `Instructions: ${medication.instructions}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.82;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const handleTaken = () => {
    setStatus('taken');
    onTaken();
  };

  const handleMissed = () => {
    setStatus('missed');
    onMissed();
  };

  const statusStyles = {
    pending: 'border-gray-200 bg-white',
    taken: 'border-green-500 bg-green-50',
    missed: 'border-red-400 bg-red-50',
  };

  return (
    <article
      className={`rounded-2xl border-4 shadow-md p-6 transition-all ${statusStyles[status]}`}
      aria-label={`Medication card for ${medication.name}`}
    >
      {/* Status badge */}
      {status !== 'pending' && (
        <div
          role="status"
          aria-live="polite"
          className={`text-2xl font-bold mb-3 ${status === 'taken' ? 'text-green-700' : 'text-red-700'}`}
        >
          {status === 'taken' ? '✅ Taken' : '❌ Missed'}
        </div>
      )}

      {/* Medication name */}
      <h3 className="text-3xl font-bold text-gray-900 mb-2">{medication.name}</h3>

      {/* Dosage */}
      <p className="text-2xl text-blue-800 font-semibold mb-1">
        💊 {medication.dosage}
      </p>

      {/* Dose times */}
      <div className="flex flex-wrap gap-2 mb-3">
        {medication.dose_times.map((t, i) => (
          <span
            key={i}
            className="bg-blue-100 text-blue-900 text-xl font-bold px-4 py-2 rounded-xl"
          >
            ⏰ {t}
          </span>
        ))}
      </div>

      {/* Instructions */}
      {medication.instructions && (
        <p className="text-lg text-gray-700 mb-1">
          📋 <span className="font-medium">{medication.instructions}</span>
        </p>
      )}

      {/* Doctor */}
      {medication.prescribing_doctor && (
        <p className="text-base text-gray-500 mb-4">
          👨‍⚕️ Prescribed by {medication.prescribing_doctor}
        </p>
      )}

      {/* Adherence */}
      {medication.adherence_percent !== undefined && (
        <div className="mb-4">
          <p className="text-base text-gray-600 mb-1">
            Adherence: <strong>{medication.adherence_percent}%</strong>
          </p>
          <div className="w-full bg-gray-200 rounded-full h-3" role="progressbar"
            aria-valuenow={medication.adherence_percent} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`h-3 rounded-full transition-all ${
                medication.adherence_percent >= 80
                  ? 'bg-green-600'
                  : medication.adherence_percent >= 50
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${medication.adherence_percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="grid grid-cols-3 gap-3 mt-2">
        {/* Speak */}
        <button
          onClick={speak}
          className="bg-yellow-400 hover:bg-yellow-300 text-black font-bold py-4 rounded-xl text-xl touch-target transition-colors"
          aria-label={`Speak medication details for ${medication.name}`}
        >
          🔊 Speak
        </button>

        {/* Taken */}
        <button
          onClick={handleTaken}
          disabled={status !== 'pending'}
          className="bg-green-700 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-xl touch-target transition-colors"
          aria-label={`Mark ${medication.name} as taken`}
          aria-pressed={status === 'taken'}
        >
          ✅ Taken
        </button>

        {/* Missed */}
        <button
          onClick={handleMissed}
          disabled={status !== 'pending'}
          className="bg-red-700 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl text-xl touch-target transition-colors"
          aria-label={`Mark ${medication.name} as missed`}
          aria-pressed={status === 'missed'}
        >
          ❌ Missed
        </button>
      </div>
    </article>
  );
}
