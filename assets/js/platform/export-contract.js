export const EXPORT_CONTRACT_VERSION='1.0.0';
export function createExportEnvelope({platform,module,schemaVersion,tables,limitations=[]}){
  if(!platform?.id||!platform?.version||!platform?.build||!module?.id||!module?.version||!module?.build)throw new Error('Platform and module release identity are required.');
  if(!Array.isArray(tables)||!tables.length)throw new Error('At least one validated table is required.');
  return{contractVersion:EXPORT_CONTRACT_VERSION,platform,module,schemaVersion,generatedAt:new Date().toISOString(),reviewState:'professional-draft',limitations,tables};
}

