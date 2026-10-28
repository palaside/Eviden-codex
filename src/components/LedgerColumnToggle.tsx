// src/components/LedgerColumnToggle.tsx
import React, { useState, useEffect } from 'react';
// Icons replaced with Unicode characters to avoid react-icons dependency

/**
 * Columns for the SLIP ledger table.
 */
export const ledgerColumns = [
  { key: 'seq', label: 'ลำดับ' },
  { key: 'chatPage', label: 'หน้าแชท' },
  { key: 'dossierPage', label: 'หน้า A4' },
  { key: 'source', label: 'ภาพ/พิกัดอ้างอิง' },
  { key: 'dateTime', label: 'วันที่-เวลา' },
  { key: 'bank', label: 'ธนาคาร' },
  { key: 'reference', label: 'รหัสอ้างอิงธุรกรรม (Ref ID)' },
  { key: 'senderName', label: 'ชื่อผู้โอน (ต้นทาง)' },
  { key: 'senderAccount', label: 'เลขที่บัญชีต้นทาง' },
  { key: 'receiverName', label: 'ชื่อผู้รับโอน (ปลายทาง)' },
  { key: 'receiverAccount', label: 'เลขที่บัญชีปลายทาง' },
  { key: 'amount', label: 'จำนวนเงิน (บาท)' },
  { key: 'status', label: 'สถานะการตรวจพิสูจน์' },
];

/**
 * Props for the column toggle component.
 */
interface Props {
  visible: Record<string, boolean>;
  setVisible: (newState: Record<string, boolean>) => void;
  persist?: boolean; // if true, sync to localStorage
}

export const LedgerColumnToggle: React.FC<Props> = ({ visible, setVisible, persist = false }) => {
  const [open, setOpen] = useState(false);

  // Persist visibility to localStorage when requested
  useEffect(() => {
    if (persist) {
      const stored = localStorage.getItem('ledgerColumnVisibility');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setVisible({ ...visible, ...Object.fromEntries(ledgerColumns.map(({ key }) => [key, parsed[key] ?? true])) });
        } catch {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (persist) {
      localStorage.setItem('ledgerColumnVisibility', JSON.stringify(visible));
    }
  }, [visible, persist]);

  const toggleColumn = (key: string) => {
    setVisible({ ...visible, [key]: !visible[key] });
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="p-1 rounded-full hover:bg-white/10 transition-colors"
        title="ตั้งค่าคอลัมน์"
      >
        <span className="text-slate-300 w-4 h-4" aria-label="settings">⚙️</span>
      </button>
      {open && (
        <div
          className={`absolute right-0 mt-2 w-56 bg-[#070a0f]/90 backdrop-blur-md border border-white/10 rounded shadow-lg p-3 transition-opacity duration-200 ${open ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-200">ตั้งค่าคอลัมน์</span>
            <button onClick={() => setOpen(false)} className="p-0.5 hover:text-slate-100">
                              <span className="w-3 h-3" aria-label="close">✖️</span>
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {ledgerColumns.map(col => (
              <label key={col.key} className="flex items-center text-xs text-slate-300 mb-1">
                <input
                  type="checkbox"
                  checked={!!visible[col.key]}
                  onChange={() => toggleColumn(col.key)}
                  className="mr-2"
                />
                {col.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
