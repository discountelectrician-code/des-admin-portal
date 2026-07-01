import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2, XCircle, AlertTriangle, Database, Play, FileJson } from 'lucide-react';

type DataType = 'Employees' | 'Customers' | 'Worksites' | 'Appointments' | 'Services' | 'Invoices' | 'Unknown';

const GOLDEN_ORDER: DataType[] = ['Employees', 'Customers', 'Worksites', 'Appointments', 'Services', 'Invoices'];

interface ProcessResult {
  total: number;
  success: number;
  failed: number;
  errors: { index: number; reason: string; record: any }[];
}

export default function MigrationUtility() {
  const [fileData, setFileData] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [detectedType, setDetectedType] = useState<DataType>('Unknown');
  const [sessionUploaded, setSessionUploaded] = useState<Set<DataType>>(new Set());
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ProcessResult | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectType = (data: any[]): DataType => {
    if (!data || data.length === 0) return 'Unknown';
    const sample = data[0];
    
    // Auto-detection logic based on legacy Bubble fields or new fields
    if (sample.first_name || sample.last_name || sample['Display Name'] || (sample.name && sample.email && sample.role)) {
      return 'Employees';
    }
    if (sample['First Name'] || sample['Last Name'] || sample.firstName || (sample.name && sample.contact)) {
      return 'Customers';
    }
    if (sample['Street'] || sample['Job Street'] || sample.location) {
      return 'Worksites';
    }
    if (sample['Appointment Type'] || sample['Start Time'] || sample.schedule) {
      return 'Appointments';
    }
    if (sample['Description'] && sample['Qty'] && sample['UnitPrice'] && sample['Invoice #']) {
      return 'Services';
    }
    if (sample['Invoice #'] && sample['Total'] && sample['Balance Due']) {
      return 'Invoices';
    }
    
    return 'Unknown';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResults(null);
    setProgress(0);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        const dataArray = Array.isArray(json) ? json : [json];
        setFileData(dataArray);
        const type = detectType(dataArray);
        setDetectedType(type);
      } catch (err) {
        console.error('Failed to parse JSON', err);
        alert('Invalid JSON file format.');
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.name.endsWith('.json')) {
      alert('Please drop a valid JSON file.');
      return;
    }
    
    if (fileInputRef.current) {
      // Create a DataTransfer to assign to the input
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileInputRef.current.files = dataTransfer.files;
      
      // Trigger onChange manually
      const event = new Event('change', { bubbles: true });
      fileInputRef.current.dispatchEvent(event);
    }
  };

  const getEndpointForType = (type: DataType) => {
    switch (type) {
      case 'Employees': return '/api/employees';
      case 'Customers': return '/api/customers';
      case 'Worksites': return '/api/worksites';
      case 'Appointments': return '/api/appointments';
      case 'Services': return '/api/services';
      case 'Invoices': return '/api/invoices';
      default: return null;
    }
  };

  const processFile = async () => {
    if (!fileData || detectedType === 'Unknown') return;
    
    // Check Golden Order
    const currentIndex = GOLDEN_ORDER.indexOf(detectedType);
    if (currentIndex > 0) {
      const prevType = GOLDEN_ORDER[currentIndex - 1];
      if (!sessionUploaded.has(prevType)) {
        const confirmed = window.confirm(`Warning: Missing Dependency. It is highly recommended to upload ${prevType} before ${detectedType}. Do you want to proceed anyway?`);
        if (!confirmed) return;
      }
    }

    const endpoint = getEndpointForType(detectedType);
    if (!endpoint) {
      alert('No valid endpoint configured for this type.');
      return;
    }

    setIsProcessing(true);
    setResults(null);
    setProgress(0);

    const resultStats: ProcessResult = {
      total: fileData.length,
      success: 0,
      failed: 0,
      errors: []
    };

    for (let i = 0; i < fileData.length; i++) {
      const record = fileData[i];
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record)
        });

        if (res.ok) {
          resultStats.success++;
        } else {
          let errorMessage = `${res.status} ${res.statusText}`;
          try {
            const errorText = await res.text();
            try {
              const errorJson = JSON.parse(errorText);
              errorMessage = errorJson.message || errorJson.error || errorJson.details || JSON.stringify(errorJson);
            } catch {
              errorMessage = errorText ? (errorText.length > 200 ? errorText.substring(0, 200) + '...' : errorText) : errorMessage;
            }
          } catch (e) {
            // Failed to read response body
          }
          
          resultStats.failed++;
          resultStats.errors.push({ index: i, reason: errorMessage, record });
        }
      } catch (err: any) {
        resultStats.failed++;
        resultStats.errors.push({ index: i, reason: err.message || 'Network error', record });
      }
      setProgress(i + 1);
    }

    setResults(resultStats);
    setIsProcessing(false);
    
    if (resultStats.failed === 0) {
      setSessionUploaded(prev => new Set(prev).add(detectedType));
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden font-sans">
      <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
        <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
          <Database className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-800 tracking-tight">Migration Utility</h2>
          <p className="text-sm text-slate-500">Import and normalize legacy Bubble JSON data exports.</p>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Upload & Configuration */}
        <div className="lg:col-span-1 space-y-6">
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">1. Upload File</h3>
            
            <div 
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                fileData ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
              }`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input 
                type="file" 
                accept=".json" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                {fileData ? (
                  <FileJson className="w-8 h-8 text-emerald-500" />
                ) : (
                  <UploadCloud className="w-8 h-8 text-slate-400" />
                )}
                <span className="text-sm font-medium text-slate-600">
                  {fileData ? fileName : 'Drag & drop JSON file here'}
                </span>
                {!fileData && <span className="text-xs text-slate-400">or click to browse</span>}
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">2. Data Type Detection</h3>
            
            <select 
              value={detectedType} 
              onChange={(e) => setDetectedType(e.target.value as DataType)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-medium text-slate-700 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-shadow"
              disabled={isProcessing}
            >
              <option value="Unknown">Select Data Type...</option>
              {GOLDEN_ORDER.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            
            {detectedType !== 'Unknown' && (
              <div className="text-xs text-slate-500">
                Mapped to <span className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-600">{getEndpointForType(detectedType)}</span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={processFile}
              disabled={!fileData || detectedType === 'Unknown' || isProcessing}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm tracking-tight rounded-xl shadow-md transition duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Process File</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Status & Golden Order */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-200">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4">Golden Order Enforcer</h3>
            <div className="flex flex-wrap gap-2 items-center text-sm">
              {GOLDEN_ORDER.map((type, idx) => {
                const isCurrent = detectedType === type;
                const isUploaded = sessionUploaded.has(type);
                
                return (
                  <React.Fragment key={type}>
                    <div className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${
                      isCurrent ? 'bg-indigo-600 text-white border-indigo-600 font-medium shadow-sm' :
                      isUploaded ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      'bg-white text-slate-500 border-slate-200'
                    }`}>
                      {isUploaded && !isCurrent && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {type}
                    </div>
                    {idx < GOLDEN_ORDER.length - 1 && (
                      <span className="text-slate-300 font-bold">&rarr;</span>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            {detectedType === 'Invoices' && !sessionUploaded.has('Services') && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-amber-800 text-xs font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Missing Dependency: Please upload Services catalog first. Invoices rely on service line items for accurate joining.</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[300px]">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">Execution Status</h3>
              {fileData && (
                <div className="text-xs font-mono font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded">
                  {progress} / {fileData.length} Records
                </div>
              )}
            </div>
            
            <div className="flex-1 p-5 overflow-y-auto">
              {!fileData && !results && (
                <div className="h-full flex items-center justify-center text-sm text-slate-400">
                  Awaiting file upload...
                </div>
              )}
              
              {isProcessing && (
                <div className="space-y-4">
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-2 transition-all duration-300 ease-out"
                      style={{ width: `${(progress / fileData!.length) * 100}%` }}
                    />
                  </div>
                  <p className="text-sm text-slate-600 text-center animate-pulse">
                    Normalizing and mapping {detectedType.toLowerCase()} to schema...
                  </p>
                </div>
              )}

              {results && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-slate-800">{results.total}</div>
                      <div className="text-xs text-slate-500 uppercase font-bold tracking-wide mt-1">Total</div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-emerald-600">{results.success}</div>
                      <div className="text-xs text-emerald-600/70 uppercase font-bold tracking-wide mt-1">Success</div>
                    </div>
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-center">
                      <div className="text-2xl font-bold text-rose-600">{results.failed}</div>
                      <div className="text-xs text-rose-600/70 uppercase font-bold tracking-wide mt-1">Failed</div>
                    </div>
                  </div>

                  {results.errors.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-rose-500" />
                        Error Summary
                      </h4>
                      <div className="bg-rose-50/50 border border-rose-100 rounded-lg p-1 overflow-hidden">
                        <div className="max-h-32 overflow-y-auto p-2 space-y-2">
                          {results.errors.map((err, idx) => (
                            <div key={idx} className="text-xs text-rose-700 flex flex-col gap-1 pb-2 border-b border-rose-100/50 last:border-0 last:pb-0">
                              <span className="font-semibold">Row {err.index + 1}: {err.reason}</span>
                              <span className="font-mono text-[10px] text-rose-500/80 truncate">
                                {JSON.stringify(err.record)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {results.failed === 0 && results.total > 0 && (
                    <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center gap-3">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                      <div>
                        <div className="font-bold text-sm">Migration Successful</div>
                        <div className="text-xs text-emerald-700 mt-0.5">All records were successfully normalized and imported into Firestore.</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
