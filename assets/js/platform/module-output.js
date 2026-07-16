export const MODULE_OUTPUT_VERSION='1.0.0';
export function createModuleOutput({assessmentId,projectId,module,status='draft',results,limitations=[],evidenceReferences=[],reviewState='unreviewed'}){
  if(!assessmentId||!projectId||!module?.id||!module?.version||!module?.build)throw new Error('Complete output identity is required.');
  return{schemaVersion:MODULE_OUTPUT_VERSION,assessmentId,projectId,module,status,reviewState,results,limitations,evidenceReferences,updatedAt:new Date().toISOString()};
}

