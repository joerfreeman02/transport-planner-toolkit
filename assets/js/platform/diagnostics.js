export const DIAGNOSTICS_VERSION='1.0.0';

export function createDiagnostic({code,severity='warning',message,affectedInformation='',recoverable=true,action,context}){
  if(!/^[A-Z][A-Z0-9_]+$/.test(code))throw new Error('Diagnostic code must be stable uppercase text.');
  if(!['critical','high','medium','warning'].includes(severity))throw new Error('Unsupported diagnostic severity.');
  return{code,severity,message:String(message),affectedInformation:String(affectedInformation),recoverable:Boolean(recoverable),action:String(action),context:{...context},occurredAt:new Date().toISOString()};
}

export function renderDiagnostics(container,records=[]){
  container.replaceChildren();
  if(!records.length){container.textContent='No current diagnostics.';return;}
  for(const record of records){const item=document.createElement('div');item.className=`diagnostic ${record.severity}`;const strong=document.createElement('strong');strong.textContent=`${record.severity.toUpperCase()} — ${record.message}`;const detail=document.createElement('p');detail.textContent=record.action;item.append(strong,detail);container.append(item);}
}

export function downloadDiagnostics(filename,records,context){
  const blob=new Blob([JSON.stringify({contractVersion:DIAGNOSTICS_VERSION,generatedAt:new Date().toISOString(),context,records},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

