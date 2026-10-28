import React, { DragEvent, ChangeEvent, useRef } from 'react';
import { GlassCard } from '@/components/GlassCard';
import { GlassButton } from '@/components/GlassButton';

interface UploadZoneProps {
  onFilesSelected: (files: FileList) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onFilesSelected }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(e.dataTransfer.files);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(e.target.files);
    }
  };

  return (
    <GlassCard className="p-6 text-center">
      <div
        className="border-2 border-dashed border-[var(--accent-cyan)] rounded-lg py-12 cursor-pointer hover:bg-[rgba(56,189,248,0.1)] transition"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={handleClick}
      >
        <p className="text-[var(--glass-text-on-glass)] mb-4">ลากไฟล์ที่นี่หรือคลิกเพื่อเลือกไฟล์</p>
        <GlassButton type="button" className="glass-button-cyan" onClick={handleClick}>
          เลือกไฟล์
        </GlassButton>
        <input
          type="file"
          multiple
          accept="image/*"
          ref={fileInputRef}
          className="hidden"
          onChange={handleChange}
        />
      </div>
    </GlassCard>
  );
};
