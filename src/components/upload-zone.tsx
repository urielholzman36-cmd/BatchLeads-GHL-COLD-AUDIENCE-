"use client";

import { useRef, useState } from "react";

interface UploadZoneProps {
  onFileLoaded: (file: File) => void;
}

export default function UploadZone({ onFileLoaded }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
      setError("Please upload a .csv or .xlsx file.");
      return;
    }
    setError(null);
    setFileName(file.name);
    onFileLoaded(file);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <label
        htmlFor="csv-upload"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center w-full h-52 border-2 border-dashed rounded-2xl cursor-pointer transition-all overflow-hidden group ${
          isDragging
            ? "border-[#d633a0] bg-[#fff3fb] scale-[1.01]"
            : "border-[#1e2a78]/20 bg-white/60 hover:border-[#d633a0]/60 hover:bg-white/90"
        }`}
      >
        {fileName ? (
          <>
            <svg className="w-8 h-8 text-green-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-medium text-gray-700">{fileName}</p>
            <p className="text-xs text-gray-500 mt-1">Click or drag to replace</p>
          </>
        ) : (
          <>
            <div className="absolute inset-0 vo360-gradient-bg opacity-0 group-hover:opacity-[0.04] transition-opacity pointer-events-none" />
            <div className="relative w-14 h-14 rounded-2xl vo360-gradient-bg p-[2px] mb-4 shadow-[0_10px_30px_-12px_rgba(214,51,160,0.5)]">
              <div className="w-full h-full rounded-[14px] bg-white flex items-center justify-center">
                <svg className="w-7 h-7 text-[#1e2a78]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
            </div>
            <p className="text-base font-semibold text-[#0b1020]">
              {isDragging ? "Drop it like it's hot" : "Drag & drop your file"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              or <span className="vo360-gradient-text font-semibold">click to browse</span> · CSV, XLSX
            </p>
          </>
        )}
      </label>
      <input
        id="csv-upload"
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={onInputChange}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
