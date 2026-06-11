import React from 'react';
import BG_IMAGE from '@/assets/Mahkota-Jaya.svg';
import { createPortal } from "react-dom";

// --- Tipe Data ---
export interface InstallmentCoupon {
  id: string;
  installment_index: number;
  due_date: string; 
  amount: number;
  status?: string;
}

interface ContractInfo {
  contract_ref: string;
  tenor_days: number;
  customers: {
    name: string;
    address: string | null;
    business_address?: string | null;
    phone?: string | null;
  } | null;
  sales_agents?: { agent_code: string } | null;
  collectors?: { collector_code: string } | null;
}

interface PrintCoupon8x5Props {
  coupons: InstallmentCoupon[];
  contract: ContractInfo;
}

export function PrintCoupon8x5({ coupons, contract }: PrintCoupon8x5Props) {
  
  // --- Inject CSS ---
  React.useEffect(() => {
    const printStyles = `
      /* =========================================
         1. GLOBAL & RESET
         ========================================= */
      * { margin: 0; padding: 0; box-sizing: border-box; }

      body { 
        font-family: 'Times New Roman', Times, serif; 
        -webkit-print-color-adjust: exact; 
        print-color-adjust: exact; 
      }

      /* =========================================
         2. PENGATURAN HALAMAN (GRID SYSTEM)
         ========================================= */
      @media screen {
        body {
          background-color: #525659;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px;
        }
        .print-coupon-wrapper {
          width: 297mm;
          height: 210mm;
          background: white;
          box-shadow: 0 0 15px rgba(0,0,0,0.5);
          padding: 3mm; 
          margin-bottom: 30px;
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
        }
        .print-btn-container {
            position: fixed; bottom: 30px; right: 30px; z-index: 9999;
        }
        .print-btn {
            background-color: #dc3545; color: white; border: none;
            padding: 15px 30px; border-radius: 50px; font-weight: bold; cursor: pointer;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
            font-family: sans-serif; display: flex; align-items: center; gap: 8px;
        }
        .print-btn:hover { background-color: #c82333; }
      }

      @media print {
        @page { 
          size: A4 landscape; 
          margin: 0; 
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body { 
          margin: 0; 
          background: white; 
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-coupon-wrapper {
          width: 297mm;
          height: 210mm;
          padding: 3mm; 
          margin: 0 auto;
          page-break-after: always;
          page-break-inside: avoid;
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
        }
        .print-coupon-wrapper:last-child { page-break-after: avoid; }
        .print-btn-container { display: none !important; }
      }

      /* =========================================
         3. GRID LAYOUT & GARIS POTONG 
         ========================================= */
      .coupon-grid {
        display: grid;
        grid-template-columns: repeat(3, 8.8cm);
        grid-template-rows: repeat(3, 6.1cm);
       
      }

      .coupon-card {
        width: 8.8cm;
        height: 6.1cm;
        position: relative;
        background-color: white;
        overflow: hidden;
        border: 2.5px dashed #666;
      }

      .bg-img-layer {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        object-fit: cover; 
        object-position: top center; 
        z-index: 1; 
      }

      
      /* =========================================
         4. POSISI DATA (TEXT)
         ========================================= */
      .content-layer {
        position: relative;
        z-index: 10; 
        width: 100%;
        height: 100%;
      }

      .title-section {
        position: absolute;
        top: 18mm; 
        left: 50%;
        transform: translateX(-50%);
        text-align: center;
        width: 100%;
      }
      .voucher-title {
        font-size: 10.5pt; 
        font-weight: normal; 
        color: #000;
        text-decoration: underline;
      }

      .content-area {
        position: absolute;
        top: 24.5mm; 
        left: 1.5mm; 
        width: 100%;
      }

      .data-row {
        font-size: 10.3pt; 
        line-height: 1.15; 
        color: #000;
        white-space: nowrap;
      }

      .data-row .label {
        display: inline-block;
        width: 26mm; 
        font-weight: normal;
      }
      /* Narrow label variant for tighter label-value spacing (e.g. Rekening) */
      .data-row .label.label-narrow {
        width: 22mm; /* reduced from 26mm to bring value closer */
      }
      .data-row .value { 
        font-weight: normal; 
      }

      .value-alamat {
        display: inline-block;
        max-width: 70mm;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: bottom;
        white-space: nowrap;
      }

      .red-text { 
        color: red; 
      }

      .contract-code {
        position: absolute;
        right: 3mm;
        top:23mm;
        font-size: 12pt;
        font-weight: bold;
        color: #000;
        z-index: 10;
      }

      .right-section {
        position: absolute;
        right: 1mm; 
        bottom: 7mm; 
        text-align: right;
      }
      .lbl-besar { 
        font-size: 10pt; 
        color: #000; 
        text-decoration: underline; 
      }
      .val-besar { 
        font-size: 11pt; 
        color: red; 
        font-weight: bold;
      }

      .footer {
        position: absolute; 
        bottom: 1.3mm; 
        width: 100%; 
        text-align: center;
        font-size: 10pt; 
        color: red; 
        font-weight: bold;
      }
      
      /* Urgent Style Override */
      .coupon-urgent .data-row,
      .coupon-urgent .footer,
      .coupon-urgent .voucher-title,
      .coupon-urgent .contract-code,
      .coupon-urgent .lbl-besar,
      .coupon-urgent .val-besar {
        color: red !important;
      }
    `;
    
    // Inject Style
    const styleElement = document.createElement('style');
    styleElement.textContent = printStyles;
    styleElement.setAttribute('data-print-styles', 'true');
    document.head.appendChild(styleElement);
    
    return () => {
      const existingStyles = document.querySelectorAll('[data-print-styles="true"]');
      existingStyles.forEach(el => el.remove());
    };
  }, []);

  // --- Helper Functions ---
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("id-ID", {
      day: "2-digit", month: "2-digit", year: "numeric",
    });
  };

  const formatAmount = (amount: number) => {
    return amount.toLocaleString("id-ID");
  };

  const truncateText = (text: string, maxLength: number) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    // New behavior: if text is longer than maxLength, show first maxLength characters
    // and append ellipsis (ellipsis is outside the maxLength).
    return text.substring(0, maxLength) + "...";
  };

  const isUrgentCoupon = (coupon: InstallmentCoupon, tenor: number) => {
    const installmentIndex = coupon.installment_index;
    const remainingDays = tenor - installmentIndex;
    return remainingDays <= 10;
  };

  const groupCouponsIntoPages = (coupons: InstallmentCoupon[], couponsPerPage: number = 9) => {
    const pages: InstallmentCoupon[][] = [];
    for (let i = 0; i < coupons.length; i += couponsPerPage) {
      pages.push(coupons.slice(i, i + couponsPerPage));
    }
    return pages;
  };

  // --- Data Preparation ---
  // noFakturBase removed; we'll build per-coupon identifier including installment index
  const displayAddress = contract.customers?.business_address || contract.customers?.address || "-";
  // Truncated address for printing (max 35 chars)
  const truncatedAddressForPrint = truncateText(displayAddress, 35);
  const couponPages = groupCouponsIntoPages(coupons);

  // Constants
  const REKENING_NUMBER = "0082-0100-3537-567";
  const KANTOR_NUMBER = "0821 8802 0656";
  // Single source of truth: imported asset from src/assets (resolved & hashed by Vite)
  const bgDataUrl = BG_IMAGE;

  const printContent = (
    <>
      {/* Tombol Print */}
      <div className="print-btn-container">
        <button onClick={() => window.print()} className="print-btn">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
                <path d="M19 8H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zm-3 11H8v-5h8v5zm3-7c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm-1-9H6v4h12V3z"/>
            </svg>
            CETAK HALAMAN
        </button>
      </div>

      {couponPages.map((pagesCoupons, pageIndex) => (
        <div key={pageIndex} className="print-coupon-wrapper">
          {/* Cutting Guidelines Enhanced */}
          <div className="cutting-guide">
            ✂ POTONG MENGIKUTI SEMUA GARIS PUTUS-PUTUS - IKUTI SEMUA SISI ✂
          </div>
          
          {/* Instruksi potong tambahan */}
          <div style={{
            position: 'absolute',
            top: '-15mm',
            right: '10mm',
            fontSize: '8pt',
            color: '#333',
            background: 'white',
            textAlign: 'center',
            zIndex: 15,
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}>
            <div style={{ fontWeight: 'bold', color: '#d32f2f', marginBottom: '1mm' }}>
              📋 PANDUAN POTONG:
            </div>
            <div style={{ fontSize: '7pt', lineHeight: '1.3' }}>
              1. Potong garis LUAR grid dulu ⬜<br />
              2. Potong garis DALAM antar kupon ✂<br />
              3. Ikuti semua tanda ✂ di sudut<br />
              4. Gunakan penggaris untuk hasil rapi
            </div>
          </div>
          
          {/* Corner Registration Marks */}
          <div style={{
            position: 'absolute',
            top: '1mm',
            left: '1mm',
            width: '5mm',
            height: '5mm',
            borderTop: '2px solid #000',
            borderLeft: '2px solid #000',
            zIndex: 10
          }}></div>
          <div style={{
            position: 'absolute',
            top: '1mm',
            right: '1mm',
            width: '5mm',
            height: '5mm',
            borderTop: '2px solid #000',
            borderRight: '2px solid #000',
            zIndex: 10
          }}></div>
          <div style={{
            position: 'absolute',
            bottom: '1mm',
            left: '1mm',
            width: '5mm',
            height: '5mm',
            borderBottom: '2px solid #000',
            borderLeft: '2px solid #000',
            zIndex: 10
          }}></div>
          <div style={{
            position: 'absolute',
            bottom: '1mm',
            right: '1mm',
            width: '5mm',
            height: '5mm',
            borderBottom: '2px solid #000',
            borderRight: '2px solid #000',
            zIndex: 10
          }}></div>
          
          <div className="coupon-grid">
            {Array.from({ length: 9 }, (_, index) => {
              const coupon = pagesCoupons[index];
              
              if (!coupon) {
                // Render kartu kosong dengan panduan potong
                return (
                  <div key={`empty-${index}`} className="coupon-card empty-card">
                    <div className="empty-card-text">
                      <div>KARTU KOSONG</div>
                      <div style={{ fontSize: '8pt', marginTop: '2mm' }}>
                        Potong sesuai garis
                      </div>
                    </div>
                  </div>
                );
              }

              const isUrgent = isUrgentCoupon(coupon, contract.tenor_days);
              
              return (
                <div key={coupon.id} className={`coupon-card ${isUrgent ? 'coupon-urgent' : ''}`}>

                  {/* Layer 1: Background - use preloaded data URL if available, otherwise CSS fallback */}
                  {bgDataUrl ? (
                    <img src={bgDataUrl} className="bg-img-layer" alt="background" />
                  ) : (
                    <div 
                      className="bg-img-layer"
                      style={{
                        background: 'linear-gradient(135deg, #87ceeb 0%, #98d8e8 50%, #b0e0e6 100%)',
                        opacity: 0.8
                      }}
                    />
                  )}

                  {/* Layer 2: Konten Text */}
                  <div className="content-layer">
                    {/* Title Section */}
                    <div className="title-section">
                      <div className="voucher-title">VOUCHER ANGSURAN</div>
                    </div>

                    <div className="content-area">
            <div className="data-row">
              <span className="label">No. Kupon</span>
              <span className="value">
                : <span className="red-text">{coupon.installment_index}</span>-{contract.tenor_days}
                {'\u00A0'.repeat(5)}
                {contract.sales_agents?.agent_code || '-'}
                {'/'}
                {contract.collectors?.collector_code || '-'}
              </span>
            </div>
            <div className="data-row">
              <span className="label">Nama</span>
        <span className="value">: {truncateText(contract.customers?.name || "-", 30)}</span>
            </div>
            <div className="data-row">
              <span className="label">No HP</span>
              <span className="value">: {contract.customers?.phone || '-'}</span>
            </div>

                        <div className="data-row">
                            <span className="label">Alamat</span>
                            <span className="value value-alamat">: {truncatedAddressForPrint}</span>
                            
                        </div>

                        <div className="data-row">
                            <span className="label">Jatuh Tempo</span>
                            <span className="value">: {formatDate(coupon.due_date)}</span>
                        </div>

            {/* Angsuran Ke row removed - included in No, Kupon field as installment/tenor/sales/collector */}
            <div className="data-row" >
              <span className="label label-narrow">Rekening BRI</span>
              <span className="value red-text" style={{fontWeight:'bolder'}} >( {REKENING_NUMBER} )</span>
            </div>
            
            <div className="data-row">
              <span className="label">A.N SUMBER MUTIARA ELEKTRONIK</span>
            </div>

                    </div>

                    {/* Contract Code - positioned on the right side */}
                    <div className="contract-code">
                        {contract.contract_ref}
                    </div>

                    <div className="right-section">
                        <div className="lbl-besar">Besar Angsuran</div>
                        <div className="val-besar">Rp {formatAmount(coupon.amount)}</div>
                    </div>

                    <div className="footer">KANTOR / {KANTOR_NUMBER}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );

  return createPortal(printContent, document.body);
}

export default PrintCoupon8x5;