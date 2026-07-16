export const KNOWLEDGE_CONTRACT_VERSION='1.0.0';
export function createKnowledgeRecord({recordId,recordType,data,sources=[],lifecycle='draft',history=[]}){
  if(!recordId||!recordType)throw new Error('Knowledge record identity and type are required.');
  if(!['draft','researched','verified','stale','superseded'].includes(lifecycle))throw new Error('Unsupported lifecycle state.');
  return{schemaVersion:KNOWLEDGE_CONTRACT_VERSION,recordId,recordType,lifecycle,data,sources,verifiedBy:null,verifiedAt:null,history,supersedes:null};
}
export function promoteKnowledgeRecord(record,reviewer){if(!String(reviewer||'').trim())throw new Error('Reviewer identity is required.');const at=new Date().toISOString();return{...record,lifecycle:'verified',verifiedBy:reviewer.trim(),verifiedAt:at,history:[...record.history,{at,action:'verified',by:reviewer.trim()}]};}

