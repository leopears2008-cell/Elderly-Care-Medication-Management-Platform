'use client';

import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { aiApi, type PrescriptionScanResult } from '@/lib/api';

export default function PrescriptionScanner() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<PrescriptionScanResult | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setFileWithPreview = (f: File) => {
    setFile(f);
    setResult(null);
    setError('');
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFileWithPreview(e.target.files[0]);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.[0]) setFileWithPreview(e.dataTransfer.files[0]);
  };

  const scan = async () => {
    if (!file) return;
    setScanning(true);
    setError('');
    try {
      const res = await aiApi.scanPrescription(file);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Scan failed. Please try again.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <section aria-label="AI Prescription Scanner" className="max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">🔬 AI Prescription Scanner</h2>
      <p className="text-gray-600 mb-6">
        Upload a photo of a prescription and Gemini AI will extract medication details automatically.
      </p>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        className={`border-4 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors touch-target
          ${dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}`}
        aria-label="Upload prescription image — click or drag and drop"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Prescription preview" className="max-h-64 mx-auto rounded-xl object-contain" />
        ) : (
          <>
            <div className="text-6xl mb-4" aria-hidden="true">📄</div>
            <p className="text-xl text-gray-600 font-medium">
              Click to upload or drag &amp; drop
            </p>
            <p className="text-gray-400 mt-2">JPEG, PNG, WEBP, HEIC — max 10 MB</p>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={onFileChange}
          className="sr-only"
          aria-hidden="true"
        />
      </div>

      {file && (
        <p className="mt-3 text-gray-700 text-base">
          📎 <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-red-700 font-medium text-lg">
          ⚠️ {error}
        </p>
      )}

      <button
        onClick={scan}
        disabled={!file || scanning}
        className="mt-5 w-full bg-blue-800 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xl font-bold py-5 rounded-2xl touch-target transition-colors flex items-center justify-center gap-3"
        aria-label="Scan prescription with Gemini AI"
      >
        {scanning ? (
          <>
            <span className="animate-spin text-2xl" aria-hidden="true">⟳</span>
            Scanning with Gemini AI...
          </>
        ) : (
          '🔬 Scan Prescription'
        )}
      </button>

      {/* Results */}
      {result && (
        <div className="mt-8" aria-live="polite" aria-label="Scan results">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            ✅ Found {result.medications.length} Medication{result.medications.length !== 1 ? 's' : ''}
            {result.confidence !== undefined && (
              <span className="ml-3 text-base font-normal text-gray-500">
                ({Math.round((result.confidence ?? 0) * 100)}% confidence)
              </span>
            )}
          </h3>
          <div className="space-y-4">
            {result.medications.map((med, i) => (
              <div key={i} className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
                <p className="text-xl font-bold text-blue-900">💊 {med.name}</p>
                <p className="text-gray-700 text-lg mt-1">
                  <strong>Dosage:</strong> {med.dosage}
                </p>
                <p className="text-gray-700">
                  <strong>Frequency:</strong> {med.frequency}
                </p>
                {med.instructions && (
                  <p className="text-gray-700">
                    <strong>Instructions:</strong> {med.instructions}
                  </p>
                )}
                {med.prescribing_doctor && (
                  <p className="text-gray-500 text-base mt-1">
                    👨‍⚕️ {med.prescribing_doctor}
                  </p>
                )}
              </div>
            ))}
          </div>
          {result.raw_text && (
            <details className="mt-4">
              <summary className="cursor-pointer text-gray-500 text-base hover:text-gray-700">
                View raw prescription text
              </summary>
              <pre className="mt-2 p-4 bg-gray-100 rounded-xl text-sm text-gray-700 whitespace-pre-wrap">
                {result.raw_text}
              </pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
