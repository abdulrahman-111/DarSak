export const operations=['signup','google_setup','verify_email','enrollment','setup_save','setup_complete'] as const;
export type Operation=typeof operations[number];
export function safeOperationEvent(operation:Operation,locale:string,elapsed:number,error?:{code?:string}|null){
 const code=error?.code;
 const category=!error?'none':code==='40001'||code==='PT409'?'conflict':code==='42501'?'authorization':code==='22023'||code==='23514'?'validation':code==='429'||code==='over_email_send_rate_limit'||code==='over_request_rate_limit'?'rate_limit':'provider';
 return {operation,locale:locale==='ar'?'ar':'en',outcome:error?'failed':'success',category,duration_ms:Math.min(300000,Math.max(0,Math.round(Number.isFinite(elapsed)?elapsed:0)))};
}
