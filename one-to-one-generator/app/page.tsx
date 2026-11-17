'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BNIMember, PartnerPair } from './types';
import {
  generateSmartPairs,
  getRunHistory,
  saveRunHistory,
  clearRunHistory,
  RunHistoryItem,
} from './utils/historyManager';
import Footer from './Footer';
import {
  Upload,
  RefreshCw,
  Phone,
  Briefcase,
  Building,
  User,
  ShieldCheck,
  ShieldAlert,
  Download,
  Trash2,
  FileCode,
  Printer,
} from 'lucide-react';

export default function BNIMixerApp() {
  const [csvRaw, setCsvRaw] = useState<{
    headers: string[];
    rows: string[][];
    fieldMapping: Record<string, string>;
  } | null>(null);
  const [isMapperOpen, setIsMapperOpen] = useState<boolean>(false);
  const [fileName, setFileName] = useState<string>('');

  const [members, setMembers] = useState<BNIMember[]>([]);
  const [pairs, setPairs] = useState<PartnerPair[]>([]);
  const [spotlightMember, setSpotlightMember] = useState<BNIMember | undefined>(undefined);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [enableHistoryFilter, setEnableHistoryFilter] = useState<boolean>(true);
  const [repeatWarnings, setRepeatWarnings] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Read browser storage after mount: the server render has no localStorage, so this avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(getRunHistory());
  }, []);

  // Category Pruning Helper: Extracts the most specific sub-category from breadcrumbs
  const formatProfession = (prof?: string): string => {
    if (!prof) return 'Member';
    const parts = prof.split('>').map((p) => p.trim());
    return parts[parts.length - 1] || prof;
  };

  const runSmartMatchmaking = (memberList: BNIMember[], filterEnabled: boolean) => {
    const { pairs: generatedPairs, spotlightMember: oddMember, repeatedCount } = generateSmartPairs(
      memberList,
      history,
      filterEnabled
    );
    setPairs(generatedPairs);
    setSpotlightMember(oddMember);
    setRepeatWarnings(repeatedCount);

    if (filterEnabled && generatedPairs.length > 0) {
      const updatedHistory = saveRunHistory(generatedPairs);
      setHistory(updatedHistory);
    }
  };

  const handleFileUpload = (file: File) => {
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text
        .split(/\r\n|\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length < 2) return;

      const headers = lines[0].split(',').map((h) => h.replace(/^["']|["']$/g, '').trim());
      const rows = lines.slice(1).map((line) => {
        const regex = /(?:^|,)(?:"([^"]*)"|([^,]*))/g;
        const row: string[] = [];
        let match;
        while ((match = regex.exec(line)) !== null) {
          if (match.index === regex.lastIndex) regex.lastIndex++;
          row.push((match[1] || match[2] || '').trim());
        }
        return row;
      });

      const defaultMapping: Record<string, string> = {
        fullName: headers.find((h) => /name|member/i.test(h)) || headers[0] || '',
        company: headers.find((h) => /company|business/i.test(h)) || '',
        profession: headers.find((h) => /profession|category|classification/i.test(h)) || '',
        phone: headers.find((h) => /phone|mobile|cell/i.test(h)) || '',
      };

      setCsvRaw({ headers, rows, fieldMapping: defaultMapping });
      setIsMapperOpen(true);
    };
    reader.readAsText(file);
  };

  const processMappedCsv = () => {
    if (!csvRaw) return;

    const { rows, headers, fieldMapping } = csvRaw;
    const nameIdx = headers.indexOf(fieldMapping.fullName);
    const companyIdx = headers.indexOf(fieldMapping.company);
    const profIdx = headers.indexOf(fieldMapping.profession);
    const phoneIdx = headers.indexOf(fieldMapping.phone);

    const parsedMembers: BNIMember[] = rows
      .map((row, idx) => ({
        id: `m-${idx}-${Date.now()}`,
        fullName: nameIdx !== -1 ? row[nameIdx] : `Member ${idx + 1}`,
        company: companyIdx !== -1 ? row[companyIdx] : '',
        profession: profIdx !== -1 ? row[profIdx] : '',
        phone: phoneIdx !== -1 ? row[phoneIdx] : '',
      }))
      .filter((m) => m.fullName && m.fullName.length > 0);

    setMembers(parsedMembers);
    setIsMapperOpen(false);
    runSmartMatchmaking(parsedMembers, enableHistoryFilter);
  };

  const handleReshuffle = () => {
    if (members.length === 0) return;
    runSmartMatchmaking(members, enableHistoryFilter);
  };

  const handleToggleFilter = () => {
    const nextState = !enableHistoryFilter;
    setEnableHistoryFilter(nextState);
    if (members.length > 0) {
      runSmartMatchmaking(members, nextState);
    }
  };

  const handleClearHistory = () => {
    clearRunHistory();
    setHistory([]);
    if (members.length > 0) {
      runSmartMatchmaking(members, enableHistoryFilter);
    }
  };

  const handleExportHistory = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(history, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `bni_history_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleLoadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const loadedHistory = JSON.parse(event.target?.result as string);
        if (Array.isArray(loadedHistory)) {
          localStorage.setItem('bni_1to1_history_v1', JSON.stringify(loadedHistory));
          setHistory(loadedHistory);
          if (members.length > 0) {
            runSmartMatchmaking(members, enableHistoryFilter);
          }
        }
      } catch (err) {
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 pb-16 print:bg-white print:pb-0 print:min-h-0">
      {/* Global Print Margins CSS to ensure 1-page fit */}
      <style jsx global>{`
        @media print {
          @page {
            size: portrait;
            margin: 0.3in;
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Screen Header Bar (Hidden on Print) */}
      <header className="bg-[#CF2030] text-white shadow-lg py-4 px-6 mb-8 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-white">
                Chapter Tools for BNI Members
              </p>
              <h1 className="text-xl font-black tracking-tight">One-to-One Partner Matcher</h1>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-center">
            {members.length > 0 && (
              <>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-[#CF2030] hover:bg-red-50 font-black text-xs rounded-lg transition-colors shadow-md"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Handout</span>
                </button>

              <button
                onClick={handleReshuffle}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-800 hover:bg-red-900 text-white font-bold text-xs rounded-lg transition-colors shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reshuffle</span>
              </button>
              </>
            )}

            <button
              onClick={handleExportHistory}
              disabled={history.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-40 font-bold text-xs rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export History</span>
            </button>

            <button
              onClick={() => jsonInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 font-bold text-xs rounded-lg transition-colors"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Load JSON</span>
            </button>
            <input
              type="file"
              ref={jsonInputRef}
              onChange={handleLoadJson}
              accept=".json"
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-lg transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import New</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              accept=".csv"
              className="hidden"
            />
          </div>
        </div>
      </header>

      {/* Friendly note (on screen only) */}
      <p className="max-w-7xl mx-auto px-4 sm:px-6 -mt-3 mb-6 text-xs text-slate-600 print:hidden">
        Made by a BNI member at ClearSky Digital, free for any chapter to use, in the spirit of Givers Gain. This
        is an independent tool, separate from BNI.
      </p>

      {/* Clean Print Header */}
      <div className="hidden print:block mb-2 border-b-2 border-[#CF2030] pb-1">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-black text-slate-900 tracking-tight">
            One-to-One Matchups for This Week
          </h1>
          <p className="text-[11px] text-slate-500 font-mono font-medium">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 print:px-0">
        {/* CSV Dropzone when empty */}
        {members.length === 0 && (
          <div className="max-w-xl mx-auto mt-12 print:hidden">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all bg-white shadow-sm ${
                isDragging ? 'border-[#CF2030] bg-red-50/50 scale-[1.02]' : 'border-slate-300 hover:border-red-400'
              }`}
            >
              <div className="w-16 h-16 bg-red-100 text-[#CF2030] rounded-full flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-extrabold text-slate-800">Upload Chapter Roster</h2>
              <p className="text-xs text-slate-500 mt-2 max-w-sm mx-auto">
                Upload your chapter CSV file to generate random 1-to-1 matchup cards filtered against recent pairings.
              </p>
            </div>
          </div>
        )}

        {/* Active Matches View */}
        {members.length > 0 && (
          <div>
            {/* Status & Control Strip (Hidden on Print) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
              <div className="flex items-center gap-3">
                <span className="font-extrabold text-sm text-slate-800 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-[#CF2030]" />
                  {pairs.length} Matchups ({members.length} Members)
                </span>

                <button
                  onClick={handleToggleFilter}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                    enableHistoryFilter
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-300'
                  }`}
                >
                  {enableHistoryFilter ? (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Prevent Repeats (Rolling 4): ON</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                      <span>Prevent Repeats: OFF</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs">
                {history.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-slate-400 hover:text-red-600 font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear History ({history.length})
                  </button>
                )}

                <button
                  onClick={handleReshuffle}
                  className="text-[#CF2030] font-bold hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reshuffle Matchups
                </button>
              </div>
            </div>

            {/* Repeat Warnings Banner (Hidden on Print) */}
            {!enableHistoryFilter && repeatWarnings > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 mb-6 text-xs font-semibold flex items-center gap-2 print:hidden">
                <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>Notice: {repeatWarnings} pairings in this run matched meetings from the last 4 runs.</span>
              </div>
            )}

            {/* FEATURED ODD-MAN-OUT SPOTLIGHT BANNER */}
            {spotlightMember && (
  <div className="bg-gradient-to-r from-red-600 to-amber-600 rounded-2xl p-0.5 shadow-md mb-6 print:bg-none print:border print:border-amber-400 print:p-0 print:shadow-none print:mb-2 print:rounded-lg print:break-inside-avoid">
    <div className="bg-white rounded-[15px] p-4 flex flex-col md:flex-row items-center justify-between gap-4 print:p-2 print:px-3 print:rounded-lg print:gap-1.5 print:items-start print:justify-start">
      <div className="flex items-center space-x-3 print:space-x-2 print:items-start">
        <div className="h-10 w-10 bg-red-100 text-[#CF2030] rounded-full flex items-center justify-center font-black text-xl flex-shrink-0 print:h-5 print:w-5 print:text-[10px] print:mt-0.5">
                      🎯
                    </div>
        <div className="text-left">
          <div className="flex items-center gap-2 print:justify-start">
            <span className="bg-red-100 text-[#CF2030] text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider print:text-[8px] print:px-1.5 print:py-0">
                          Odd Count Spotlight Member
                        </span>
            <span className="text-xs text-slate-500 font-medium print:text-[9px]">
              Needs a 1-to-1 partner this week!
            </span>
                      </div>
          <h3 className="text-base font-extrabold text-slate-900 mt-0.5 print:text-xs print:mt-0 print:text-left">
                        {spotlightMember.fullName}
                      </h3>
          <p className="text-xs text-slate-600 flex items-center gap-2 mt-0.5 print:text-[9px] print:mt-0 print:justify-start">
                        <span className="font-semibold text-[#CF2030]">
                          {formatProfession(spotlightMember.profession)}
                        </span>
                        {spotlightMember.company && <span>• {spotlightMember.company}</span>}
                      </p>
                    </div>
                  </div>

      <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-2 md:pt-0 border-slate-100 print:border-t-0 print:pt-0 print:w-auto print:justify-start">
                    {spotlightMember.phone && (
                      <a
                        href={`tel:${spotlightMember.phone}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-[#CF2030] font-bold text-xs rounded-lg print:text-[9px] print:py-0.5 print:px-2"
                      >
                        <Phone className="w-3.5 h-3.5 print:w-2.5 print:h-2.5" />
                        <span>{spotlightMember.phone}</span>
                      </a>
                    )}
        <span className="text-xs text-amber-800 font-bold bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg print:text-[9px] print:py-0.5 print:px-2">
                      Schedule a 1 to 1!
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Compact 2-Column Matchups Grid for 1-Page Print */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2 print:gap-1.5">
              {pairs.map((pair, idx) => (
                <div
                  key={pair.id}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col justify-between hover:border-red-300 transition-colors print:break-inside-avoid print:shadow-none print:border-slate-300 print:rounded-lg"
                >
      <div className="grid grid-cols-2 relative bg-white divide-x divide-slate-100">
                    {/* Member A */}
        <div className="flex flex-col">
                      <div className="bg-slate-50/80 border-b border-slate-100 px-3 py-1.5 flex items-center justify-between print:px-2 print:py-0.5">
                        <h4 className="font-bold text-xs text-slate-900 truncate pr-1 print:text-[11px]">
                            {pair.memberA.fullName}
                          </h4>
                        <span className="text-[10px] text-slate-400 font-mono font-bold flex-shrink-0 print:text-[9px]">
              #{idx + 1}A
            </span>
                        </div>
                      <div className="p-2.5 flex flex-col justify-center gap-0.5 min-h-[56px] print:p-1.5 print:min-h-[42px]">
                        <p className="text-[11px] font-semibold text-[#CF2030] flex items-center gap-1 print:text-[10px]">
                          <Briefcase className="w-3 h-3 flex-shrink-0 print:hidden" />
                          <span className="truncate">{formatProfession(pair.memberA.profession)}</span>
                        </p>
            {pair.memberA.company ? (
                          <p className="text-[10px] text-slate-500 flex items-center gap-1 print:text-[9px]">
                            <Building className="w-3 h-3 flex-shrink-0 text-slate-400 print:hidden" />
                            <span className="truncate">{pair.memberA.company}</span>
                          </p>
            ) : (
                          <p className="text-[10px] text-slate-300 italic print:text-[9px]">No company listed</p>
                        )}
                      </div>
                    </div>

                    {/* Member B */}
        <div className="flex flex-col">
                      <div className="bg-slate-50/80 border-b border-slate-100 px-3 py-1.5 flex items-center justify-between print:px-2 print:py-0.5">
                        <h4 className="font-bold text-xs text-slate-900 truncate pr-1 print:text-[11px]">
                            {pair.memberB.fullName}
                          </h4>
                        <span className="text-[10px] text-slate-400 font-mono font-bold flex-shrink-0 print:text-[9px]">
              #{idx + 1}B
            </span>
                        </div>
                      <div className="p-2.5 flex flex-col justify-center gap-0.5 min-h-[56px] print:p-1.5 print:min-h-[42px]">
                        <p className="text-[11px] font-semibold text-[#CF2030] flex items-center gap-1 print:text-[10px]">
                          <Briefcase className="w-3 h-3 flex-shrink-0 print:hidden" />
                          <span className="truncate">{formatProfession(pair.memberB.profession)}</span>
                        </p>
            {pair.memberB.company ? (
                          <p className="text-[10px] text-slate-500 flex items-center gap-1 print:text-[9px]">
                            <Building className="w-3 h-3 flex-shrink-0 text-slate-400 print:hidden" />
                            <span className="truncate">{pair.memberB.company}</span>
                          </p>
            ) : (
                          <p className="text-[10px] text-slate-300 italic print:text-[9px]">No company listed</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer */}
                  <div className="bg-slate-50 border-t border-slate-100 px-3 py-1.5 grid grid-cols-2 divide-x divide-slate-200/60 text-[10px] text-slate-600 font-mono print:px-2 print:py-0.5 print:text-[9px]">
                    <div className="pr-1">
                      {pair.memberA.phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="w-2.5 h-2.5 text-slate-400 flex-shrink-0 print:hidden" />
                          <span>{pair.memberA.phone}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-sans italic">No phone</span>
                      )}
                    </div>
                    <div className="pl-3 print:pl-2">
                      {pair.memberB.phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="w-2.5 h-2.5 text-slate-400 flex-shrink-0 print:hidden" />
                          <span>{pair.memberB.phone}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 font-sans italic">No phone</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Column Mapper Modal */}
        {isMapperOpen && csvRaw && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
              <h3 className="text-lg font-extrabold text-slate-900 mb-1">Map CSV Columns</h3>
              <p className="text-xs text-slate-500 mb-4">
                Confirm which columns match your BNI roster data fields.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                  <select
                    value={csvRaw.fieldMapping.fullName}
                    onChange={(e) =>
                      setCsvRaw({
                        ...csvRaw,
                        fieldMapping: { ...csvRaw.fieldMapping, fullName: e.target.value },
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    {csvRaw.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Company</label>
                  <select
                    value={csvRaw.fieldMapping.company}
                    onChange={(e) =>
                      setCsvRaw({
                        ...csvRaw,
                        fieldMapping: { ...csvRaw.fieldMapping, company: e.target.value },
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="">-- None --</option>
                    {csvRaw.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Profession / Classification</label>
                  <select
                    value={csvRaw.fieldMapping.profession}
                    onChange={(e) =>
                      setCsvRaw({
                        ...csvRaw,
                        fieldMapping: { ...csvRaw.fieldMapping, profession: e.target.value },
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="">-- None --</option>
                    {csvRaw.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                  <select
                    value={csvRaw.fieldMapping.phone}
                    onChange={(e) =>
                      setCsvRaw({
                        ...csvRaw,
                        fieldMapping: { ...csvRaw.fieldMapping, phone: e.target.value },
                      })
                    }
                    className="w-full border border-slate-300 rounded-lg p-2 font-medium"
                  >
                    <option value="">-- None --</option>
                    {csvRaw.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setIsMapperOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 font-bold text-xs rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={processMappedCsv}
                  className="px-4 py-2 bg-[#CF2030] text-white font-extrabold text-xs rounded-lg hover:bg-red-700"
                >
                  Generate Matchups
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}